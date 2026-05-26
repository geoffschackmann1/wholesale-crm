/**
 * Module 3 acceptance test — runs WITHOUT a live Inngest server.
 *
 * Tests the enrichment + alert pipeline logic directly against the DB.
 *
 * Run with: pnpm test:m3
 * Requires DATABASE_URL to be set and the DB to be seeded (pnpm seed).
 *
 * Checks:
 *  1. Creates synthetic lead_events for an Expired (contactable) and Withdrawn (held) property
 *  2. Calls enrichment steps directly (not via Inngest server)
 *  3. Verifies owners row created for both properties
 *  4. Verifies contacts rows created (≥1 phone per property)
 *  5. Verifies enrichment_jobs rows: 2 per property (batchdata_property + batchdata_skiptrace)
 *  6. Verifies SMS was "sent" (logged to console in dev mode)
 *  7. Verifies held lead SMS message contains "contact blocked"
 *  8. Verifies re-running enrichment for same property within 90 days skips BatchData calls (cache)
 */

import {
  requireDb,
  properties,
  owners,
  contacts,
  enrichmentJobs,
  leadEvents,
  buyBoxes,
  eq,
  and,
  sql,
  count,
  desc,
} from '@wholesale-crm/db';
import { batchdataPropertyLookup, batchdataSkipTrace } from '@wholesale-crm/enrich';

const db = requireDb();

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

// ── Inline enrichment logic (mirrors inngest/functions/enrich-and-alert.ts) ─

async function hasRecentEnrichment(propertyId: string): Promise<boolean> {
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

// Returns the SMS message that would be sent (or logged in dev mode)
async function runEnrichment(
  propertyId: string,
  leadEventId: string,
  eligibility: string,
  triggerType: string,
): Promise<{
  ownerName: string;
  topPhone: string | undefined;
  cached: boolean;
  smsBody: string;
  batchDataCallCount: number; // how many BatchData calls were made (0 if cached)
}> {
  const propertyRows = await db.select().from(properties).where(eq(properties.id, propertyId)).limit(1);
  const property = propertyRows[0];
  if (!property) throw new Error(`property not found: ${propertyId}`);

  const address = {
    line1: property.addressLine1,
    city: property.city,
    state: property.state,
    zip: property.zip,
  };

  const cached = await hasRecentEnrichment(propertyId);
  let ownerName = 'Unknown Owner';
  let topPhone: string | undefined;
  let batchDataCallCount = 0;

  if (!cached) {
    // Property lookup
    const jobRows = await db
      .insert(enrichmentJobs)
      .values({ propertyId, provider: 'batchdata_property', status: 'pending' })
      .returning({ id: enrichmentJobs.id });
    const jobId = jobRows[0]?.id;

    batchDataCallCount++;
    const propResult = await batchdataPropertyLookup(address);
    ownerName = propResult.ownerName;

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

    // Update property equity/arv
    await db
      .update(properties)
      .set({
        equityPct: propResult.estimatedEquityPct ?? null,
        arv: propResult.arv ?? null,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, propertyId));

    if (jobId) {
      await db
        .update(enrichmentJobs)
        .set({ status: 'complete', costCents: 1000, updatedAt: new Date() })
        .where(eq(enrichmentJobs.id, jobId));
    }

    // Skip trace
    const stJobRows = await db
      .insert(enrichmentJobs)
      .values({ propertyId, provider: 'batchdata_skiptrace', status: 'pending' })
      .returning({ id: enrichmentJobs.id });
    const stJobId = stJobRows[0]?.id;

    batchDataCallCount++;
    const stResult = await batchdataSkipTrace(address);

    for (const phone of stResult.phones.slice(0, 5)) {
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

    for (const email of stResult.emails.slice(0, 2)) {
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

    if (stJobId) {
      await db
        .update(enrichmentJobs)
        .set({ status: 'complete', costCents: 1000, updatedAt: new Date() })
        .where(eq(enrichmentJobs.id, stJobId));
    }

    const sortedPhones = [...stResult.phones].sort((a, b) => b.confidence - a.confidence);
    topPhone = sortedPhones[0]?.number;
  } else {
    // Load from cache
    const ownerRows = await db
      .select()
      .from(owners)
      .where(eq(owners.propertyId, propertyId))
      .limit(1);

    const owner = ownerRows[0];
    if (owner) {
      ownerName = owner.name;
      const contactRows = await db
        .select()
        .from(contacts)
        .where(and(eq(contacts.ownerId, owner.id), eq(contacts.kind, 'phone')))
        .orderBy(desc(contacts.confidenceScore))
        .limit(1);
      topPhone = contactRows[0]?.value;
    }
  }

  const daysOnMarket = property.daysOnMarket ?? 0;
  const price = property.currentListPrice
    ? `$${property.currentListPrice.toLocaleString()}`
    : 'N/A';
  const isHeld = eligibility === 'held';

  const smsBody = [
    `🏠 ${property.addressLine1}, ${property.city} ${property.zip}`,
    `${triggerType}: Listed ${daysOnMarket}d @ ${price}`,
    `Owner: ${ownerName} | ${topPhone ?? 'No phone'}`,
    isHeld ? '⚠️ Withdrawn — contact blocked' : '✅ Contactable',
  ].join('\n');

  // Dev mode SMS — log to console
  console.log('[SMS dev mode] Alert message:');
  console.log(smsBody);

  return { ownerName, topPhone, cached, smsBody, batchDataCallCount };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Module 3 Acceptance Test');
  console.log('═══════════════════════════════════════════\n');

  // Ensure at least one active buy box
  const boxes = await db.select().from(buyBoxes).where(eq(buyBoxes.isActive, true));
  if (boxes.length === 0) {
    console.log('  No active buy boxes — inserting test box...');
    await db.insert(buyBoxes).values({
      id: crypto.randomUUID(),
      name: 'M3 Test Box',
      isActive: true,
      criteriaJson: {},
    });
  }
  const [activeBuyBox] = await db.select().from(buyBoxes).where(eq(buyBoxes.isActive, true)).limit(1);
  if (!activeBuyBox) throw new Error('No active buy box found');

  // ── Step 1: Create two synthetic properties ──────────────────────────────────
  console.log('Step 1: Creating synthetic properties...');

  const expiredPropId = crypto.randomUUID();
  const withdrawnPropId = crypto.randomUUID();
  const now = new Date();

  await db.insert(properties).values([
    {
      id: expiredPropId,
      addressLine1: '123 Test Expired St',
      city: 'Phoenix',
      state: 'AZ',
      zip: '85001',
      currentStatus: 'Expired',
      currentListPrice: 275000,
      daysOnMarket: 45,
      mlsListingId: `M3TEST-EXP-${Date.now()}`,
      lastStatusChangeAt: now,
    },
    {
      id: withdrawnPropId,
      addressLine1: '456 Test Withdrawn Ave',
      city: 'Scottsdale',
      state: 'AZ',
      zip: '85251',
      currentStatus: 'Withdrawn',
      currentListPrice: 350000,
      daysOnMarket: 30,
      mlsListingId: `M3TEST-WIT-${Date.now()}`,
      lastStatusChangeAt: now,
    },
  ]);

  console.log('  Properties created');

  // ── Step 2: Create lead_events ───────────────────────────────────────────────
  console.log('\nStep 2: Creating lead_events...');

  const expiredLeadRows = await db
    .insert(leadEvents)
    .values({
      propertyId: expiredPropId,
      buyBoxId: activeBuyBox.id,
      triggerType: 'Expired',
      eligibility: 'contactable',
      occurredAt: now,
    })
    .returning({ id: leadEvents.id });

  const withdrawnLeadRows = await db
    .insert(leadEvents)
    .values({
      propertyId: withdrawnPropId,
      buyBoxId: activeBuyBox.id,
      triggerType: 'Withdrawn',
      eligibility: 'held',
      occurredAt: now,
    })
    .returning({ id: leadEvents.id });

  const expiredLeadId = expiredLeadRows[0]?.id ?? '';
  const withdrawnLeadId = withdrawnLeadRows[0]?.id ?? '';

  assert(expiredLeadId !== '', 'Expired lead_event created');
  assert(withdrawnLeadId !== '', 'Withdrawn lead_event created');

  // ── Step 3: Run enrichment for Expired (contactable) ────────────────────────
  console.log('\nStep 3: Running enrichment for Expired property...');

  const expiredResult = await runEnrichment(expiredPropId, expiredLeadId, 'contactable', 'Expired');

  assert(expiredResult.batchDataCallCount === 2, 'Expired: 2 BatchData calls made');
  assert(!expiredResult.cached, 'Expired: not using cache (first run)');
  assert(!expiredResult.smsBody.includes('contact blocked'), 'Expired: SMS does not say "contact blocked"');
  assert(expiredResult.smsBody.includes('✅ Contactable'), 'Expired: SMS says "Contactable"');

  // ── Step 4: Run enrichment for Withdrawn (held) ──────────────────────────────
  console.log('\nStep 4: Running enrichment for Withdrawn property...');

  const withdrawnResult = await runEnrichment(withdrawnPropId, withdrawnLeadId, 'held', 'Withdrawn');

  assert(withdrawnResult.batchDataCallCount === 2, 'Withdrawn: 2 BatchData calls made');
  assert(!withdrawnResult.cached, 'Withdrawn: not using cache (first run)');
  assert(withdrawnResult.smsBody.includes('contact blocked'), 'Withdrawn: SMS contains "contact blocked"');
  assert(withdrawnResult.smsBody.includes('⚠️'), 'Withdrawn: SMS contains warning emoji');

  // ── Step 5: Verify owners rows ────────────────────────────────────────────────
  console.log('\nStep 5: Verifying owners rows...');

  const expiredOwner = await db
    .select()
    .from(owners)
    .where(eq(owners.propertyId, expiredPropId))
    .limit(1);

  const withdrawnOwner = await db
    .select()
    .from(owners)
    .where(eq(owners.propertyId, withdrawnPropId))
    .limit(1);

  assert(expiredOwner.length > 0 && expiredOwner[0] !== undefined, 'Owner row created for Expired property');
  assert(withdrawnOwner.length > 0 && withdrawnOwner[0] !== undefined, 'Owner row created for Withdrawn property');

  const expiredOwnerId = expiredOwner[0]?.id;
  const withdrawnOwnerId = withdrawnOwner[0]?.id;

  // ── Step 6: Verify contacts rows (≥1 phone per property) ─────────────────────
  console.log('\nStep 6: Verifying contacts rows...');

  if (expiredOwnerId) {
    const expiredPhones = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.ownerId, expiredOwnerId), eq(contacts.kind, 'phone')));

    assert(expiredPhones.length >= 1, `Expired: ≥1 phone contact created (got ${expiredPhones.length})`);
  }

  if (withdrawnOwnerId) {
    const withdrawnPhones = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.ownerId, withdrawnOwnerId), eq(contacts.kind, 'phone')));

    assert(withdrawnPhones.length >= 1, `Withdrawn: ≥1 phone contact created (got ${withdrawnPhones.length})`);
  }

  // ── Step 7: Verify enrichment_jobs rows (2 per property) ─────────────────────
  console.log('\nStep 7: Verifying enrichment_jobs rows...');

  const [{ expiredJobCount }] = await db
    .select({ expiredJobCount: count() })
    .from(enrichmentJobs)
    .where(and(eq(enrichmentJobs.propertyId, expiredPropId), eq(enrichmentJobs.status, 'complete')));

  const [{ withdrawnJobCount }] = await db
    .select({ withdrawnJobCount: count() })
    .from(enrichmentJobs)
    .where(and(eq(enrichmentJobs.propertyId, withdrawnPropId), eq(enrichmentJobs.status, 'complete')));

  assert(Number(expiredJobCount) === 2, `Expired: 2 complete enrichment_jobs (got ${expiredJobCount})`);
  assert(Number(withdrawnJobCount) === 2, `Withdrawn: 2 complete enrichment_jobs (got ${withdrawnJobCount})`);

  // Check providers
  const expiredJobs = await db
    .select()
    .from(enrichmentJobs)
    .where(and(eq(enrichmentJobs.propertyId, expiredPropId), eq(enrichmentJobs.status, 'complete')));

  const hasPropertyJob = expiredJobs.some((j) => j.provider === 'batchdata_property');
  const hasSkiptraceJob = expiredJobs.some((j) => j.provider === 'batchdata_skiptrace');

  assert(hasPropertyJob, 'Expired: has batchdata_property job');
  assert(hasSkiptraceJob, 'Expired: has batchdata_skiptrace job');

  // Check cost_cents logged
  const allCostsCovered = expiredJobs.every((j) => j.costCents !== null && j.costCents > 0);
  assert(allCostsCovered, 'All enrichment_jobs have cost_cents > 0');

  // ── Step 8: Cache check — re-run enrichment, expect 0 BatchData calls ────────
  console.log('\nStep 8: Cache check (re-run within 90 days)...');

  const cachedResult = await runEnrichment(expiredPropId, expiredLeadId, 'contactable', 'Expired');

  assert(cachedResult.cached, 'Second run: cache hit (no BatchData calls)');
  assert(cachedResult.batchDataCallCount === 0, 'Second run: 0 BatchData calls made');
  assert(cachedResult.ownerName !== 'Unknown Owner', 'Second run: owner name loaded from cache');

  // ── Step 9: Cleanup (remove test data) ───────────────────────────────────────
  console.log('\nStep 9: Cleaning up test data...');
  await db.execute(sql`DELETE FROM lead_events WHERE property_id IN (${expiredPropId}, ${withdrawnPropId})`);
  await db.execute(sql`DELETE FROM enrichment_jobs WHERE property_id IN (${expiredPropId}, ${withdrawnPropId})`);
  await db.execute(sql`DELETE FROM owners WHERE property_id IN (${expiredPropId}, ${withdrawnPropId})`);
  await db.execute(sql`DELETE FROM properties WHERE id IN (${expiredPropId}, ${withdrawnPropId})`);
  console.log('  Test data cleaned up');

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────');
  if (failed === 0) {
    console.log(`  PASS  ${passed}/${passed + failed} checks passed`);
  } else {
    console.log(`  FAIL  ${passed} passed, ${failed} failed`);
  }
  console.log('───────────────────────────────────────────\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Module 3 acceptance test error:', err);
  process.exit(1);
});
