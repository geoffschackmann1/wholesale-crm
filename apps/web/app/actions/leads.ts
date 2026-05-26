'use server';

import { getDb } from '@/lib/db';
import { leadEvents, properties, owners, eq, desc } from '@wholesale-crm/db';

export type RecentLead = {
  id: string;
  propertyId: string;
  eligibility: string;
  triggerType: string;
  occurredAt: Date;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  ownerName: string | null;
  enriched: boolean;
};

export async function getRecentLeads(limit = 5): Promise<RecentLead[]> {
  const db = await getDb();
  if (!db) return [];

  try {
    // Fetch newest lead_events with property data
    const rows = await db
      .select({
        id: leadEvents.id,
        propertyId: leadEvents.propertyId,
        eligibility: leadEvents.eligibility,
        triggerType: leadEvents.triggerType,
        occurredAt: leadEvents.occurredAt,
        addressLine1: properties.addressLine1,
        city: properties.city,
        state: properties.state,
        zip: properties.zip,
        ownerName: owners.name,
      })
      .from(leadEvents)
      .innerJoin(properties, eq(leadEvents.propertyId, properties.id))
      .leftJoin(owners, eq(owners.propertyId, properties.id))
      .orderBy(desc(leadEvents.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      propertyId: row.propertyId,
      eligibility: row.eligibility,
      triggerType: row.triggerType,
      occurredAt: row.occurredAt,
      addressLine1: row.addressLine1,
      city: row.city,
      state: row.state,
      zip: row.zip,
      ownerName: row.ownerName ?? null,
      enriched: row.ownerName !== null && row.ownerName !== undefined,
    }));
  } catch {
    return [];
  }
}
