import {
  requireDb,
  properties,
  buyBoxes,
  leadEvents,
  propertyMatchesBuyBox,
  deriveEligibility,
  sql,
  eq,
  inArray,
  count,
} from '@wholesale-crm/db';

const DELISTED_STATUSES = ['Expired', 'Withdrawn', 'Cancelled'];

async function runAcceptanceTest() {
  console.log('=== Acceptance Test: Module 1 ===\n');

  const db = requireDb();

  let passed = true;
  const failures: string[] = [];

  function assert(condition: boolean, message: string) {
    if (!condition) {
      passed = false;
      failures.push(`FAIL: ${message}`);
      console.error(`  ✗ FAIL: ${message}`);
    } else {
      console.log(`  ✓ PASS: ${message}`);
    }
  }

  // Step 1: Truncate lead_events and buy_boxes
  console.log('Step 1: Truncating lead_events and buy_boxes...');
  await db.execute(sql`TRUNCATE TABLE lead_events RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE buy_boxes RESTART IDENTITY CASCADE`);

  // Step 2: Check seed data (expects seed to have been run, or run it here)
  const [{ value: propCount }] = await db
    .select({ value: count() })
    .from(properties);

  console.log(`\nStep 2: Property count = ${propCount}`);
  if (Number(propCount) === 0) {
    console.log('  No properties found — running seed first...');
    const { seedProperties } = await import('./seed-properties.js');
    await seedProperties(false);
  }

  // Step 3: Insert 2 buy boxes
  console.log('\nStep 3: Inserting buy boxes...');

  const [boxA] = await db
    .insert(buyBoxes)
    .values({
      id: crypto.randomUUID(),
      name: 'Affordable SFR',
      isActive: true,
      criteriaJson: {
        zips: ['10001', '10002', '10003', '10004', '10005'],
        priceMax: 400000,
        bedsMin: 2,
        propertyTypes: ['SFR'],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  const [boxB] = await db
    .insert(buyBoxes)
    .values({
      id: crypto.randomUUID(),
      name: 'Mid-Market',
      isActive: true,
      criteriaJson: {
        zips: ['10006', '10007', '10008', '10009', '10010'],
        priceMax: 600000,
        sqftMin: 1200,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  console.log(`  Box A id: ${boxA.id}`);
  console.log(`  Box B id: ${boxB.id}`);

  // Step 4: Run propertyMatchesBuyBox for every delisted property × every active buy box
  console.log('\nStep 4: Running buy-box matching...');

  const delistedProperties = await db
    .select()
    .from(properties)
    .where(inArray(properties.currentStatus, DELISTED_STATUSES));

  console.log(`  Total delisted properties: ${delistedProperties.length}`);

  const activeBuyBoxes = await db
    .select()
    .from(buyBoxes)
    .where(eq(buyBoxes.isActive, true));

  const leadEventRows: (typeof leadEvents.$inferInsert)[] = [];
  let boxAMatchCount = 0;
  let boxBMatchCount = 0;

  for (const property of delistedProperties) {
    for (const buyBox of activeBuyBoxes) {
      const propForMatch = {
        id: property.id,
        county: property.county,
        zip: property.zip,
        currentListPrice: property.currentListPrice,
        beds: property.beds,
        sqft: property.sqft,
        propertyType: property.propertyType,
        equityPct: property.equityPct,
        ownerOccupiedFlag: undefined as boolean | null | undefined,
      };

      const matches = propertyMatchesBuyBox(propForMatch, buyBox);
      if (matches) {
        const eligibility = deriveEligibility(property.currentStatus);
        leadEventRows.push({
          id: crypto.randomUUID(),
          propertyId: property.id,
          buyBoxId: buyBox.id,
          triggerType: property.currentStatus,
          eligibility,
          occurredAt: property.lastStatusChangeAt ?? property.updatedAt,
          dismissedAt: null,
          createdAt: new Date(),
        });

        if (buyBox.id === boxA.id) boxAMatchCount++;
        if (buyBox.id === boxB.id) boxBMatchCount++;
      }
    }
  }

  // Step 5: Insert lead_events with idempotency (insert with conflict ignore)
  console.log('\nStep 5: Inserting lead_events...');
  if (leadEventRows.length > 0) {
    // Insert in batches of 100 to avoid parameter limits
    const BATCH = 100;
    for (let i = 0; i < leadEventRows.length; i += BATCH) {
      await db
        .insert(leadEvents)
        .values(leadEventRows.slice(i, i + BATCH))
        .onConflictDoNothing();
    }
  }

  // Step 6: Query and print summary
  console.log('\nStep 6: Results summary:');
  console.log(`  Total delisted properties: ${delistedProperties.length}`);
  console.log(`  Box A (Affordable SFR) matches: ${boxAMatchCount}`);
  console.log(`  Box B (Mid-Market) matches: ${boxBMatchCount}`);

  const eligibilityCounts = await db
    .select({
      eligibility: leadEvents.eligibility,
      cnt: count(),
    })
    .from(leadEvents)
    .groupBy(leadEvents.eligibility);

  const totalLeadEvents = eligibilityCounts.reduce(
    (sum: number, r: { eligibility: string; cnt: number }) => sum + Number(r.cnt),
    0,
  );
  console.log(`\n  Lead events by eligibility:`);
  for (const row of eligibilityCounts) {
    console.log(`    ${row.eligibility}: ${row.cnt}`);
  }
  console.log(`  Total lead_events: ${totalLeadEvents}`);

  // Step 7: Idempotency check — re-run insert and verify count doesn't change
  console.log('\nStep 7: Idempotency check...');
  if (leadEventRows.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < leadEventRows.length; i += BATCH) {
      await db
        .insert(leadEvents)
        .values(leadEventRows.slice(i, i + BATCH))
        .onConflictDoNothing();
    }
  }

  const [{ value: countAfterRerun }] = await db
    .select({ value: count() })
    .from(leadEvents);

  assert(
    Number(countAfterRerun) === totalLeadEvents,
    `Idempotency: lead_events count unchanged (${countAfterRerun} === ${totalLeadEvents})`,
  );

  // Step 8: Spot checks
  console.log('\nStep 8: Spot checks...');

  const withdrawnEvent = await db
    .select()
    .from(leadEvents)
    .where(eq(leadEvents.triggerType, 'Withdrawn'))
    .limit(1);

  if (withdrawnEvent.length > 0) {
    assert(
      withdrawnEvent[0].eligibility === 'held',
      `Withdrawn lead_event eligibility === 'held' (got: ${withdrawnEvent[0].eligibility})`,
    );
  } else {
    console.log('  (no Withdrawn lead_events found — skipping spot check)');
  }

  const expiredEvent = await db
    .select()
    .from(leadEvents)
    .where(eq(leadEvents.triggerType, 'Expired'))
    .limit(1);

  if (expiredEvent.length > 0) {
    assert(
      expiredEvent[0].eligibility === 'contactable',
      `Expired lead_event eligibility === 'contactable' (got: ${expiredEvent[0].eligibility})`,
    );
  } else {
    console.log('  (no Expired lead_events found — skipping spot check)');
  }

  const cancelledEvent = await db
    .select()
    .from(leadEvents)
    .where(eq(leadEvents.triggerType, 'Cancelled'))
    .limit(1);

  if (cancelledEvent.length > 0) {
    assert(
      cancelledEvent[0].eligibility === 'watch_only',
      `Cancelled lead_event eligibility === 'watch_only' (got: ${cancelledEvent[0].eligibility})`,
    );
  } else {
    console.log('  (no Cancelled lead_events found — skipping spot check)');
  }

  // Final result
  console.log('\n' + '='.repeat(40));
  if (passed) {
    console.log('PASS — All acceptance checks passed.');
  } else {
    console.log('FAIL — Some checks failed:');
    for (const f of failures) {
      console.log(`  ${f}`);
    }
  }
  console.log('='.repeat(40));

  process.exit(passed ? 0 : 1);
}

runAcceptanceTest().catch((err) => {
  console.error('Acceptance test error:', err);
  process.exit(1);
});
