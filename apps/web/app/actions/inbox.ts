'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { inngest } from '@/lib/inngest';
import {
  leadEvents,
  properties,
  owners,
  contacts,
  eq,
  desc,
  sql,
  and,
} from '@wholesale-crm/db';

export type InboxLead = {
  id: string;
  propertyId: string;
  eligibility: string;
  triggerType: string;
  occurredAt: Date;
  dismissedAt: Date | null;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  currentListPrice: number | null;
  daysOnMarket: number | null;
  ownerName: string | null;
  topPhone: string | null;
  enriched: boolean;
};

export async function getInboxLeads(limit = 50): Promise<InboxLead[]> {
  const db = getDb();
  if (!db) return [];

  try {
    const rows = await db
      .select({
        id: leadEvents.id,
        propertyId: leadEvents.propertyId,
        eligibility: leadEvents.eligibility,
        triggerType: leadEvents.triggerType,
        occurredAt: leadEvents.occurredAt,
        dismissedAt: leadEvents.dismissedAt,
        addressLine1: properties.addressLine1,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        beds: properties.beds,
        baths: properties.baths,
        sqft: properties.sqft,
        currentListPrice: properties.currentListPrice,
        daysOnMarket: properties.daysOnMarket,
        ownerName: owners.name,
        topPhone: contacts.value,
      })
      .from(leadEvents)
      .innerJoin(properties, eq(leadEvents.propertyId, properties.id))
      .leftJoin(owners, eq(owners.propertyId, properties.id))
      .leftJoin(
        contacts,
        and(
          eq(contacts.ownerId, owners.id),
          eq(contacts.kind, 'phone'),
        ),
      )
      .where(sql`${leadEvents.dismissedAt} IS NULL`)
      .orderBy(desc(leadEvents.createdAt))
      .limit(limit);

    // Deduplicate by lead ID (multiple phone rows may join)
    const seen = new Set<string>();
    const deduped: InboxLead[] = [];
    for (const row of rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        deduped.push({
          id: row.id,
          propertyId: row.propertyId,
          eligibility: row.eligibility,
          triggerType: row.triggerType,
          occurredAt: row.occurredAt,
          dismissedAt: row.dismissedAt,
          addressLine1: row.addressLine1,
          city: row.city,
          state: row.state,
          zip: row.zip,
          beds: row.beds,
          baths: row.baths,
          sqft: row.sqft,
          currentListPrice: row.currentListPrice,
          daysOnMarket: row.daysOnMarket,
          ownerName: row.ownerName ?? null,
          topPhone: row.topPhone ?? null,
          enriched: row.ownerName != null,
        });
      }
    }
    return deduped;
  } catch {
    return [];
  }
}

export async function getLeadById(id: string): Promise<InboxLead | null> {
  const db = getDb();
  if (!db) return null;

  try {
    const rows = await db
      .select({
        id: leadEvents.id,
        propertyId: leadEvents.propertyId,
        eligibility: leadEvents.eligibility,
        triggerType: leadEvents.triggerType,
        occurredAt: leadEvents.occurredAt,
        dismissedAt: leadEvents.dismissedAt,
        addressLine1: properties.addressLine1,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        beds: properties.beds,
        baths: properties.baths,
        sqft: properties.sqft,
        currentListPrice: properties.currentListPrice,
        daysOnMarket: properties.daysOnMarket,
        ownerName: owners.name,
        topPhone: contacts.value,
      })
      .from(leadEvents)
      .innerJoin(properties, eq(leadEvents.propertyId, properties.id))
      .leftJoin(owners, eq(owners.propertyId, properties.id))
      .leftJoin(
        contacts,
        and(
          eq(contacts.ownerId, owners.id),
          eq(contacts.kind, 'phone'),
        ),
      )
      .where(eq(leadEvents.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      propertyId: row.propertyId,
      eligibility: row.eligibility,
      triggerType: row.triggerType,
      occurredAt: row.occurredAt,
      dismissedAt: row.dismissedAt,
      addressLine1: row.addressLine1,
      city: row.city,
      state: row.state,
      zip: row.zip,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      currentListPrice: row.currentListPrice,
      daysOnMarket: row.daysOnMarket,
      ownerName: row.ownerName ?? null,
      topPhone: row.topPhone ?? null,
      enriched: row.ownerName != null,
    };
  } catch {
    return null;
  }
}

export type LeadDetail = {
  leadId: string;
  propertyId: string;
  eligibility: string;
  triggerType: string;
  occurredAt: Date;
  dismissedAt: Date | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  currentListPrice: number | null;
  daysOnMarket: number | null;
  lat: number | null;
  lng: number | null;
  ownerName: string | null;
  mailingAddressLine1: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  phones: Array<{ id: string; value: string; dncStatus: string | null; isLikelyCell: boolean | null }>;
  emails: Array<{ id: string; value: string }>;
  enriched: boolean;
};

export async function getLeadDetail(leadId: string): Promise<LeadDetail | null> {
  const db = getDb();
  if (!db) return null;

  try {
    // Fetch lead + property + owner in one query
    const rows = await db
      .select({
        leadId: leadEvents.id,
        propertyId: leadEvents.propertyId,
        eligibility: leadEvents.eligibility,
        triggerType: leadEvents.triggerType,
        occurredAt: leadEvents.occurredAt,
        dismissedAt: leadEvents.dismissedAt,
        addressLine1: properties.addressLine1,
        addressLine2: properties.addressLine2,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        beds: properties.beds,
        baths: properties.baths,
        sqft: properties.sqft,
        yearBuilt: properties.yearBuilt,
        propertyType: properties.propertyType,
        currentListPrice: properties.currentListPrice,
        daysOnMarket: properties.daysOnMarket,
        lat: properties.lat,
        lng: properties.lng,
        ownerName: owners.name,
        ownerId: owners.id,
        mailingAddressLine1: owners.mailingAddressLine1,
        mailingCity: owners.mailingCity,
        mailingState: owners.mailingState,
        mailingZip: owners.mailingZip,
      })
      .from(leadEvents)
      .innerJoin(properties, eq(leadEvents.propertyId, properties.id))
      .leftJoin(owners, eq(owners.propertyId, properties.id))
      .where(eq(leadEvents.id, leadId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    // Fetch contacts separately
    let phones: LeadDetail['phones'] = [];
    let emails: LeadDetail['emails'] = [];

    if (row.ownerId) {
      const contactRows = await db
        .select({
          id: contacts.id,
          kind: contacts.kind,
          value: contacts.value,
          dncStatus: contacts.dncStatus,
          isLikelyCell: contacts.isLikelyCell,
        })
        .from(contacts)
        .where(eq(contacts.ownerId, row.ownerId));

      phones = contactRows
        .filter((c) => c.kind === 'phone')
        .map((c) => ({ id: c.id, value: c.value, dncStatus: c.dncStatus ?? null, isLikelyCell: c.isLikelyCell ?? null }));
      emails = contactRows
        .filter((c) => c.kind === 'email')
        .map((c) => ({ id: c.id, value: c.value }));
    }

    return {
      leadId: row.leadId,
      propertyId: row.propertyId,
      eligibility: row.eligibility,
      triggerType: row.triggerType,
      occurredAt: row.occurredAt,
      dismissedAt: row.dismissedAt,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2 ?? null,
      city: row.city,
      state: row.state,
      zip: row.zip,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      yearBuilt: row.yearBuilt,
      propertyType: row.propertyType,
      currentListPrice: row.currentListPrice,
      daysOnMarket: row.daysOnMarket,
      lat: row.lat,
      lng: row.lng,
      ownerName: row.ownerName ?? null,
      mailingAddressLine1: row.mailingAddressLine1 ?? null,
      mailingCity: row.mailingCity ?? null,
      mailingState: row.mailingState ?? null,
      mailingZip: row.mailingZip ?? null,
      phones,
      emails,
      enriched: row.ownerName != null,
    };
  } catch {
    return null;
  }
}

export async function dismissLead(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('DB not configured');
  await db
    .update(leadEvents)
    .set({ dismissedAt: new Date() })
    .where(eq(leadEvents.id, id));
  revalidatePath('/inbox');
}

export async function snoozeLead(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('DB not configured');
  const snoozeUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db
    .update(leadEvents)
    .set({ dismissedAt: snoozeUntil })
    .where(eq(leadEvents.id, id));
  revalidatePath('/inbox');
}

export async function markLeadSaved(id: string): Promise<void> {
  // "saved" is UI-only state; clear dismissed_at so it stays visible
  const db = getDb();
  if (!db) throw new Error('DB not configured');
  await db
    .update(leadEvents)
    .set({ dismissedAt: null })
    .where(eq(leadEvents.id, id));
  revalidatePath('/inbox');
  revalidatePath(`/inbox/${id}`);
}

export async function triggerEnrichment(leadEventId: string, propertyId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('DB not configured');

  // Fetch the lead event to get eligibility + triggerType
  const rows = await db
    .select({
      eligibility: leadEvents.eligibility,
      triggerType: leadEvents.triggerType,
    })
    .from(leadEvents)
    .where(eq(leadEvents.id, leadEventId))
    .limit(1);

  const lead = rows[0];
  if (!lead) throw new Error(`lead_event not found: ${leadEventId}`);

  await inngest.send({
    name: 'lead/created',
    data: {
      leadEventId,
      propertyId,
      eligibility: lead.eligibility,
      triggerType: lead.triggerType,
    },
  });

  revalidatePath(`/inbox/${leadEventId}`);
}

export async function getUndismissedCount(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const rows = await db
      .select({ id: leadEvents.id })
      .from(leadEvents)
      .where(sql`${leadEvents.dismissedAt} IS NULL`);
    return rows.length;
  } catch {
    return 0;
  }
}
