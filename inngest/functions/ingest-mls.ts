import { inngest } from '../client.js';
import {
  requireDb,
  properties,
  propertyStatusHistory,
  replayQueue,
  leadEvents,
  buyBoxes,
  propertyMatchesBuyBox,
  deriveEligibility,
  eq,
  sql,
} from '@wholesale-crm/db';

const DELISTING_STATUSES = new Set(['Expired', 'Withdrawn', 'Cancelled']);
const BATCH_SIZE = 100;

/** Coerce a value that may be a Date or an ISO string (after Inngest JSON round-trip) to Date. */
function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

export const ingestMls = inngest.createFunction(
  { id: 'ingest-mls', name: 'MLS Ingestion' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const db = requireDb();

    // Step 1: fetch pending replay queue entries (up to BATCH_SIZE)
    const pending = await step.run('fetch-pending-replay', async () => {
      return db
        .select()
        .from(replayQueue)
        .where(sql`${replayQueue.processedAt} IS NULL`)
        .orderBy(replayQueue.occurredAt)
        .limit(BATCH_SIZE);
    });

    if (pending.length === 0) {
      return { processed: 0, leadEventsCreated: 0 };
    }

    // Step 2: fetch all active buy-boxes once
    const activeBuyBoxes = await step.run('fetch-buy-boxes', async () => {
      return db.select().from(buyBoxes).where(eq(buyBoxes.isActive, true));
    });

    let totalLeadEventsCreated = 0;

    // Step 3: process each entry
    for (const entry of pending) {
      const result = await step.run(`process-entry-${entry.id}`, async () => {
        let propertyId: string;
        let prevStatus: string | null = entry.prevStatus ?? null;

        // occurredAt may have been serialized to a string via Inngest JSON round-trip
        const occurredAt = toDate(entry.occurredAt) ?? new Date();

        // Upsert the property
        const existingRows = await db
          .select({ id: properties.id, currentStatus: properties.currentStatus })
          .from(properties)
          .where(eq(properties.mlsListingId, entry.mlsListingId));

        if (existingRows.length > 0 && existingRows[0] !== undefined) {
          const existing = existingRows[0];
          propertyId = existing.id;
          // Use the DB's current status as prev if not provided in the queue entry
          if (prevStatus === null) {
            prevStatus = existing.currentStatus;
          }

          // Update property with latest snapshot data
          await db
            .update(properties)
            .set({
              addressLine1: entry.addressLine1,
              city: entry.city,
              state: entry.state,
              zip: entry.zip,
              county: entry.county ?? null,
              beds: entry.beds ?? null,
              baths: entry.baths ?? null,
              sqft: entry.sqft ?? null,
              yearBuilt: entry.yearBuilt ?? null,
              propertyType: entry.propertyType ?? null,
              currentListPrice: entry.currentListPrice ?? null,
              daysOnMarket: entry.daysOnMarket ?? null,
              currentStatus: entry.newStatus,
              lastStatusChangeAt: occurredAt,
              updatedAt: new Date(),
            })
            .where(eq(properties.id, propertyId));
        } else {
          // Insert new property — let DB generate the UUID via defaultRandom()
          const inserted = await db
            .insert(properties)
            .values({
              addressLine1: entry.addressLine1,
              city: entry.city,
              state: entry.state,
              zip: entry.zip,
              county: entry.county ?? null,
              beds: entry.beds ?? null,
              baths: entry.baths ?? null,
              sqft: entry.sqft ?? null,
              yearBuilt: entry.yearBuilt ?? null,
              propertyType: entry.propertyType ?? null,
              currentListPrice: entry.currentListPrice ?? null,
              daysOnMarket: entry.daysOnMarket ?? null,
              currentStatus: entry.newStatus,
              mlsListingId: entry.mlsListingId,
              lastStatusChangeAt: occurredAt,
            })
            .returning({ id: properties.id });

          propertyId = inserted[0]?.id ?? crypto.randomUUID();
        }

        // Always append to property_status_history
        await db.insert(propertyStatusHistory).values({
          propertyId,
          status: entry.newStatus,
          source: 'replay',
          occurredAt,
        });

        // Detect delisting transition: new status is delisted AND prev was different status
        const isDelisting =
          DELISTING_STATUSES.has(entry.newStatus) &&
          prevStatus !== entry.newStatus;

        let eventsCreated = 0;

        if (isDelisting) {
          // Fetch the current property for buy-box matching
          const propertyRows = await db
            .select()
            .from(properties)
            .where(eq(properties.id, propertyId));

          const property = propertyRows[0];
          if (property) {
            const eligibility = deriveEligibility(entry.newStatus);

            for (const buyBox of activeBuyBoxes) {
              if (propertyMatchesBuyBox(property, buyBox)) {
                // Insert with onConflictDoNothing for idempotency
                // The unique index is on (property_id, buy_box_id, occurred_at)
                const rows = await db
                  .insert(leadEvents)
                  .values({
                    propertyId,
                    buyBoxId: buyBox.id,
                    triggerType: entry.newStatus,
                    eligibility,
                    occurredAt,
                  })
                  .onConflictDoNothing()
                  .returning({ id: leadEvents.id });

                eventsCreated += rows.length;
              }
            }
          }
        }

        // Mark queue entry as processed
        await db
          .update(replayQueue)
          .set({ processedAt: new Date() })
          .where(eq(replayQueue.id, entry.id));

        return eventsCreated;
      });

      totalLeadEventsCreated += result;
    }

    return { processed: pending.length, leadEventsCreated: totalLeadEventsCreated };
  },
);
