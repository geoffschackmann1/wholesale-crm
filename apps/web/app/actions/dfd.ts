'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';
import {
  properties,
  owners,
  contacts,
  leadEvents,
  buyBoxes,
  eq,
  and,
  sql,
} from '@wholesale-crm/db';
import { batchdataPropertyLookup, batchdataSkipTrace } from '@wholesale-crm/enrich';

export type NearbyProperty = {
  id: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  currentListPrice: number | null;
  currentStatus: string;
  buyBoxMatch: boolean;
};

const MILES_PER_DEGREE_LAT = 69.0;

export async function getNearbyProperties(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<NearbyProperty[]> {
  const db = getDb();
  if (!db) return [];

  // Bounding-box approximation — no PostGIS needed
  const latDelta = radiusMiles / MILES_PER_DEGREE_LAT;
  const lngDelta = radiusMiles / (MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  try {
    const rows = await db
      .select({
        id: properties.id,
        addressLine1: properties.addressLine1,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        lat: properties.lat,
        lng: properties.lng,
        beds: properties.beds,
        baths: properties.baths,
        sqft: properties.sqft,
        currentListPrice: properties.currentListPrice,
        currentStatus: properties.currentStatus,
      })
      .from(properties)
      .where(
        and(
          sql`${properties.lat} IS NOT NULL`,
          sql`${properties.lng} IS NOT NULL`,
          sql`${properties.lat} BETWEEN ${minLat} AND ${maxLat}`,
          sql`${properties.lng} BETWEEN ${minLng} AND ${maxLng}`,
        ),
      )
      .limit(20);

    // Fetch active buy boxes for color-coding
    const activeBoxes = await db
      .select({ criteriaJson: buyBoxes.criteriaJson })
      .from(buyBoxes)
      .where(eq(buyBoxes.isActive, true));

    return rows
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        // Simple buy-box match: check if any active box criteria matches
        const buyBoxMatch = activeBoxes.some((box) => {
          const c = box.criteriaJson as { zips?: string[]; priceMin?: number; priceMax?: number };
          if (c.zips && c.zips.length > 0 && !c.zips.includes(r.zip)) return false;
          if (c.priceMin != null && (r.currentListPrice ?? 0) < c.priceMin) return false;
          if (c.priceMax != null && (r.currentListPrice ?? Infinity) > c.priceMax) return false;
          return true;
        });

        return {
          id: r.id,
          addressLine1: r.addressLine1,
          city: r.city,
          state: r.state,
          zip: r.zip,
          lat: r.lat as number,
          lng: r.lng as number,
          beds: r.beds,
          baths: r.baths,
          sqft: r.sqft,
          currentListPrice: r.currentListPrice,
          currentStatus: r.currentStatus,
          buyBoxMatch,
        };
      });
  } catch {
    return [];
  }
}

export async function saveDfdLead(
  propertyId: string,
  lat: number,
  lng: number,
): Promise<{ leadEventId: string } | { error: string }> {
  const db = getDb();
  if (!db) return { error: 'DB not configured' };

  try {
    // Fetch property
    const propRows = await db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);

    const property = propRows[0];
    if (!property) return { error: 'Property not found' };

    const address = {
      line1: property.addressLine1,
      city: property.city,
      state: property.state,
      zip: property.zip,
    };

    // Run BatchData lookup + skip trace inline
    const [propResult, skipResult] = await Promise.all([
      batchdataPropertyLookup(address),
      batchdataSkipTrace(address),
    ]);

    // Upsert owner
    const existingOwners = await db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.propertyId, propertyId))
      .limit(1);

    let ownerId: string;
    if (existingOwners.length > 0 && existingOwners[0] !== undefined) {
      ownerId = existingOwners[0].id;
      await db
        .update(owners)
        .set({
          name: propResult.ownerName,
          mailingAddressLine1: propResult.mailingAddressLine1,
          mailingCity: propResult.mailingCity,
          mailingState: propResult.mailingState,
          mailingZip: propResult.mailingZip,
          ownerOccupiedFlag: propResult.ownerOccupied ?? null,
          ownershipLengthYrs: propResult.ownershipLengthYrs ?? null,
          updatedAt: new Date(),
        })
        .where(eq(owners.id, ownerId));
    } else {
      const ownerInsert = await db
        .insert(owners)
        .values({
          propertyId,
          name: propResult.ownerName,
          mailingAddressLine1: propResult.mailingAddressLine1,
          mailingCity: propResult.mailingCity,
          mailingState: propResult.mailingState,
          mailingZip: propResult.mailingZip,
          ownerOccupiedFlag: propResult.ownerOccupied ?? null,
          ownershipLengthYrs: propResult.ownershipLengthYrs ?? null,
        })
        .returning({ id: owners.id });
      ownerId = ownerInsert[0]?.id ?? crypto.randomUUID();
    }

    // Insert contacts
    for (const phone of skipResult.phones.slice(0, 5)) {
      await db
        .insert(contacts)
        .values({
          ownerId,
          kind: 'phone',
          value: phone.number,
          confidenceScore: phone.confidence,
          isLikelyCell: phone.isLikelyCell,
        })
        .onConflictDoNothing();
    }
    for (const email of skipResult.emails.slice(0, 2)) {
      await db
        .insert(contacts)
        .values({
          ownerId,
          kind: 'email',
          value: email.address,
          confidenceScore: email.confidence,
        })
        .onConflictDoNothing();
    }

    // Ensure an active buy box exists (create one if not)
    let activeBuyBoxId: string;
    const activeBoxes = await db
      .select({ id: buyBoxes.id })
      .from(buyBoxes)
      .where(eq(buyBoxes.isActive, true))
      .limit(1);

    if (activeBoxes.length > 0 && activeBoxes[0] !== undefined) {
      activeBuyBoxId = activeBoxes[0].id;
    } else {
      const newBox = await db
        .insert(buyBoxes)
        .values({
          name: 'DFD Default',
          isActive: true,
          criteriaJson: {},
        })
        .returning({ id: buyBoxes.id });
      activeBuyBoxId = newBox[0]?.id ?? crypto.randomUUID();
    }

    // Create lead_event — DFD leads default to watch_only
    const leadRow = await db
      .insert(leadEvents)
      .values({
        propertyId,
        buyBoxId: activeBuyBoxId,
        triggerType: 'dfd',
        // DFD-sourced leads default to watch_only until buy-box match is confirmed
        eligibility: 'watch_only',
        occurredAt: new Date(),
      })
      .returning({ id: leadEvents.id });

    const leadEventId = leadRow[0]?.id;
    if (!leadEventId) return { error: 'Failed to create lead_event' };

    // Fire inngest enrichment + alert workflow
    await inngest.send({
      name: 'lead/created',
      data: {
        leadEventId,
        propertyId,
        eligibility: 'watch_only',
        triggerType: 'dfd',
      },
    });

    // Update property coordinates if not already set
    if (!property.lat || !property.lng) {
      await db
        .update(properties)
        .set({ lat, lng, updatedAt: new Date() })
        .where(eq(properties.id, propertyId));
    }

    revalidatePath('/dfd');
    revalidatePath('/inbox');

    return { leadEventId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { error: message };
  }
}

export async function uploadPropertyPhoto(
  propertyId: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceRoleKey) {
    // No-op in dev — log the intent
    console.log(`[uploadPropertyPhoto] SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set — skipping upload for property ${propertyId}`);
    return { url: '' };
  }

  const file = formData.get('photo') as File | null;
  if (!file) return { error: 'No photo in form data' };

  try {
    // Dynamic import to avoid requiring @supabase/supabase-js at build time
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${propertyId}/${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error } = await supabase.storage
      .from('property-photos')
      // TODO: set bucket lifecycle policy to purge after 90 days (Supabase Storage → Policies)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    if (error) return { error: error.message };

    const { data: publicData } = supabase.storage
      .from('property-photos')
      .getPublicUrl(path);

    return { url: publicData.publicUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return { error: message };
  }
}
