import { inngest } from '../client.js';
import {
  requireDb,
  properties,
  owners,
  contacts,
  enrichmentJobs,
  leadEvents,
  eq,
  and,
  sql,
  desc,
} from '@wholesale-crm/db';
import { batchdataPropertyLookup, batchdataSkipTrace } from '@wholesale-crm/enrich';
import { sendSms } from '../lib/twilio.js';
import { sendWebPush } from '../lib/web-push.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true when a completed batchdata_property job exists within the last 90 days. */
async function hasRecentEnrichment(propertyId: string): Promise<boolean> {
  const db = requireDb();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ id: enrichmentJobs.id })
    .from(enrichmentJobs)
    .where(
      and(
        eq(enrichmentJobs.propertyId, propertyId),
        eq(enrichmentJobs.provider, 'batchdata_property'),
        eq(enrichmentJobs.status, 'complete'),
        sql`${enrichmentJobs.createdAt} > ${cutoff}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ── Inngest function ──────────────────────────────────────────────────────────

export const enrichAndAlert = inngest.createFunction(
  { id: 'enrich-and-alert', name: 'Enrich property + send alert' },
  { event: 'lead/created' },
  async ({ event, step }) => {
    // event.data shape: { leadEventId, propertyId, eligibility, triggerType }
    const { leadEventId, propertyId, eligibility, triggerType } = event.data as {
      leadEventId: string;
      propertyId: string;
      eligibility: string;
      triggerType: string;
    };

    // ── Step 1: fetch lead + property ─────────────────────────────────────────
    const fetchedData = await step.run('fetch-lead', async () => {
      const db = requireDb();

      const leadRows = await db
        .select()
        .from(leadEvents)
        .where(eq(leadEvents.id, leadEventId))
        .limit(1);

      const leadRow = leadRows[0];
      if (!leadRow) throw new Error(`lead_event not found: ${leadEventId}`);

      const propertyRows = await db
        .select()
        .from(properties)
        .where(eq(properties.id, propertyId))
        .limit(1);

      const property = propertyRows[0];
      if (!property) throw new Error(`property not found: ${propertyId}`);

      return { lead: leadRow, property };
    });

    const property = fetchedData.property;
    const address = {
      line1: property.addressLine1,
      city: property.city,
      state: property.state,
      zip: property.zip,
    };

    // Check 90-day cache BEFORE calling BatchData
    const cached = await step.run('check-cache', async () => {
      return hasRecentEnrichment(propertyId);
    });

    let ownerName = 'Unknown Owner';
    let topPhone: string | undefined;

    if (!cached) {
      // ── Step 2: Property lookup ───────────────────────────────────────────
      const propertyLookupResult = await step.run('property-lookup', async () => {
        const db = requireDb();

        // Log job as pending
        const jobRows = await db
          .insert(enrichmentJobs)
          .values({
            propertyId: propertyId,
            provider: 'batchdata_property',
            status: 'pending',
          })
          .returning({ id: enrichmentJobs.id });

        const jobId = jobRows[0]?.id;

        try {
          const result = await batchdataPropertyLookup(address);

          // Upsert owner
          const existingOwners = await db
            .select({ id: owners.id })
            .from(owners)
            .where(eq(owners.propertyId, propertyId))
            .limit(1);

          if (existingOwners.length > 0 && existingOwners[0] !== undefined) {
            await db
              .update(owners)
              .set({
                name: result.ownerName,
                mailingAddressLine1: result.mailingAddressLine1,
                mailingCity: result.mailingCity,
                mailingState: result.mailingState,
                mailingZip: result.mailingZip,
                ownerOccupiedFlag: result.ownerOccupied ?? null,
                ownershipLengthYrs: result.ownershipLengthYrs ?? null,
                updatedAt: new Date(),
              })
              .where(eq(owners.id, existingOwners[0].id));
          } else {
            await db.insert(owners).values({
              propertyId: propertyId,
              name: result.ownerName,
              mailingAddressLine1: result.mailingAddressLine1,
              mailingCity: result.mailingCity,
              mailingState: result.mailingState,
              mailingZip: result.mailingZip,
              ownerOccupiedFlag: result.ownerOccupied ?? null,
              ownershipLengthYrs: result.ownershipLengthYrs ?? null,
            });
          }

          // Update property equity/arv
          await db
            .update(properties)
            .set({
              equityPct: result.estimatedEquityPct ?? null,
              arv: result.arv ?? null,
              updatedAt: new Date(),
            })
            .where(eq(properties.id, propertyId));

          // Mark job complete
          if (jobId) {
            await db
              .update(enrichmentJobs)
              .set({
                status: 'complete',
                costCents: 1000,
                responseJson: result as unknown as Record<string, unknown>,
                updatedAt: new Date(),
              })
              .where(eq(enrichmentJobs.id, jobId));
          }

          return result;
        } catch (err) {
          if (jobId) {
            await db
              .update(enrichmentJobs)
              .set({ status: 'failed', updatedAt: new Date() })
              .where(eq(enrichmentJobs.id, jobId));
          }
          throw err;
        }
      });

      ownerName = propertyLookupResult.ownerName;

      // ── Step 3: Skip trace ────────────────────────────────────────────────
      const skipTraceResult = await step.run('skip-trace', async () => {
        const db = requireDb();

        // Log job as pending
        const jobRows = await db
          .insert(enrichmentJobs)
          .values({
            propertyId: propertyId,
            provider: 'batchdata_skiptrace',
            status: 'pending',
          })
          .returning({ id: enrichmentJobs.id });

        const jobId = jobRows[0]?.id;

        try {
          const result = await batchdataSkipTrace(address);

          // Find owner for this property
          const ownerRows = await db
            .select({ id: owners.id })
            .from(owners)
            .where(eq(owners.propertyId, propertyId))
            .limit(1);

          const ownerId = ownerRows[0]?.id;

          if (ownerId) {
            // Insert phones (up to 5)
            for (const phone of result.phones.slice(0, 5)) {
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

            // Insert emails (up to 2)
            for (const email of result.emails.slice(0, 2)) {
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
          }

          if (jobId) {
            await db
              .update(enrichmentJobs)
              .set({
                status: 'complete',
                costCents: 1000,
                responseJson: result as unknown as Record<string, unknown>,
                updatedAt: new Date(),
              })
              .where(eq(enrichmentJobs.id, jobId));
          }

          return result;
        } catch (err) {
          if (jobId) {
            await db
              .update(enrichmentJobs)
              .set({ status: 'failed', updatedAt: new Date() })
              .where(eq(enrichmentJobs.id, jobId));
          }
          throw err;
        }
      });

      // Pick top phone by confidence
      const sortedPhones = [...skipTraceResult.phones].sort((a, b) => b.confidence - a.confidence);
      topPhone = sortedPhones[0]?.number;
    } else {
      // Use cached data — fetch from DB
      const cachedData = await step.run('load-cached-owner', async () => {
        const db = requireDb();

        const ownerRows = await db
          .select()
          .from(owners)
          .where(eq(owners.propertyId, propertyId))
          .limit(1);

        const owner = ownerRows[0];
        if (!owner) return { ownerName: 'Unknown Owner', topPhone: null };

        const contactRows = await db
          .select()
          .from(contacts)
          .where(and(eq(contacts.ownerId, owner.id), eq(contacts.kind, 'phone')))
          .orderBy(desc(contacts.confidenceScore))
          .limit(1);

        return {
          ownerName: owner.name,
          topPhone: contactRows[0]?.value ?? null,
        };
      });

      ownerName = cachedData.ownerName;
      topPhone = cachedData.topPhone ?? undefined;
    }

    // ── Step 4: Send SMS alert ────────────────────────────────────────────────
    await step.run('send-sms-alert', async () => {
      const alertTo = process.env['ALERT_PHONE_NUMBER'];
      const fromNumber = process.env['TWILIO_FROM_NUMBER'];

      const daysOnMarket = property.daysOnMarket ?? 0;
      const price = property.currentListPrice
        ? `$${property.currentListPrice.toLocaleString()}`
        : 'N/A';
      const isHeld = eligibility === 'held';

      const body = [
        `🏠 ${property.addressLine1}, ${property.city} ${property.zip}`,
        `${triggerType}: Listed ${daysOnMarket}d @ ${price}`,
        `Owner: ${ownerName} | ${topPhone ?? 'No phone'}`,
        isHeld ? '⚠️ Withdrawn — contact blocked' : '✅ Contactable',
      ].join('\n');

      if (!alertTo || !fromNumber) {
        // Dev mode — log to console
        console.log('[SMS dev mode] Alert message:');
        console.log(body);
        return;
      }

      await sendSms(alertTo, fromNumber, body);
    });

    // ── Step 5: Send Web Push (best-effort) ───────────────────────────────────
    await step.run('send-web-push', async () => {
      const isHeld = eligibility === 'held';
      await sendWebPush({
        title: `${triggerType}: ${property.addressLine1}`,
        body: isHeld
          ? `${ownerName} — ⚠️ Withdrawn, contact blocked`
          : `${ownerName} | ${topPhone ?? 'No phone'}`,
        url: `/leads/${leadEventId}`,
      });
    });

    return {
      leadEventId,
      propertyId,
      ownerName,
      cached,
    };
  },
);
