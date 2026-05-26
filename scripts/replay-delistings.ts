/**
 * replay-delistings.ts
 *
 * Populates `replay_queue` with a simulated 30-day delisting stream (100 events),
 * then optionally triggers the Inngest `ingest-mls` function.
 *
 * Usage:
 *   pnpm replay               — run against DATABASE_URL
 *   pnpm replay -- --dry-run  — print what would happen, no DB writes
 */

import { faker } from '@faker-js/faker';
import {
  requireDb,
  properties,
  replayQueue,
  sql,
} from '@wholesale-crm/db';

// ─── Constants ────────────────────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TOTAL_EVENTS = 100;
const RE_DELIST_COUNT = 5; // properties that go Active→Withdrawn→Active→Withdrawn

type DelistingStatus = 'Expired' | 'Withdrawn' | 'Cancelled';

const DELIST_STATUSES: DelistingStatus[] = ['Expired', 'Withdrawn', 'Cancelled'];
// weights: 50% Expired, 30% Withdrawn, 20% Cancelled
const DELIST_WEIGHTS = [0.5, 0.3, 0.2];

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Property = typeof properties.$inferSelect;
type ReplayInsert = typeof replayQueue.$inferInsert;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayOffset(daysFromStart: number, windowStart: Date): Date {
  return new Date(windowStart.getTime() + daysFromStart * 24 * 60 * 60 * 1000);
}

function buildEntry(
  prop: Property,
  newStatus: string,
  prevStatus: string | null,
  occurredAt: Date,
): ReplayInsert {
  return {
    id: crypto.randomUUID(),
    propertyId: prop.id,
    addressLine1: prop.addressLine1,
    city: prop.city,
    state: prop.state,
    zip: prop.zip,
    county: prop.county ?? null,
    beds: prop.beds ?? null,
    baths: prop.baths ?? null,
    sqft: prop.sqft ?? null,
    yearBuilt: prop.yearBuilt ?? null,
    propertyType: prop.propertyType ?? null,
    currentListPrice: prop.currentListPrice ?? null,
    daysOnMarket: prop.daysOnMarket ?? null,
    mlsListingId: prop.mlsListingId ?? faker.string.alphanumeric(10).toUpperCase(),
    newStatus,
    prevStatus,
    occurredAt,
    processedAt: null,
    createdAt: new Date(),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const windowStart = new Date(Date.now() - THIRTY_DAYS_MS);

  if (dryRun) {
    console.log('=== DRY RUN — no database writes ===');
    console.log(`Window: ${windowStart.toISOString()} → now`);
    console.log(`Total events to generate: ${TOTAL_EVENTS}`);
    console.log(`  - ${TOTAL_EVENTS - RE_DELIST_COUNT} single-transition delistings`);
    console.log(`  - ${RE_DELIST_COUNT} re-delist properties (Active→Withdrawn→Active→Withdrawn)`);
    console.log('');
    console.log('Status distribution (approximate):');
    console.log('  Expired   ~50%');
    console.log('  Withdrawn ~30%  (plus 5 re-delist Withdrawn)');
    console.log('  Cancelled ~20%');
    console.log('');
    console.log('After insert: triggers Inngest ingest-mls function');
    console.log('Set INNGEST_DEV=true to target dev server (http://localhost:8288)');
    return;
  }

  const db = requireDb();

  // ── 1. Clear any existing unprocessed replay queue entries ──────────────────
  const deleted = await db
    .delete(replayQueue)
    .where(sql`${replayQueue.processedAt} IS NULL`)
    .returning({ id: replayQueue.id });
  console.log(`Cleared ${deleted.length} pending replay_queue entries.`);

  // ── 2. Fetch all properties from DB ──────────────────────────────────────────
  const allProperties = await db.select().from(properties);
  if (allProperties.length < TOTAL_EVENTS) {
    throw new Error(
      `Not enough properties in DB (found ${allProperties.length}, need ${TOTAL_EVENTS}). ` +
        'Run `pnpm seed` first.',
    );
  }

  console.log(`Found ${allProperties.length} properties. Selecting ${TOTAL_EVENTS}...`);

  // ── 3. Shuffle and pick TOTAL_EVENTS properties ───────────────────────────────
  const shuffled = [...allProperties].sort(() => Math.random() - 0.5);
  const reDelist = shuffled.slice(0, RE_DELIST_COUNT);
  const normal = shuffled.slice(RE_DELIST_COUNT, TOTAL_EVENTS);

  // ── 4. Build replay entries ───────────────────────────────────────────────────

  const entries: ReplayInsert[] = [];

  // Normal single-transition delistings: evenly spaced across 30-day window
  const normalCount = normal.length; // 95
  normal.forEach((prop, idx) => {
    const dayFraction = (idx / normalCount) * 30;
    const occurredAt = dayOffset(dayFraction, windowStart);
    const status = weightedRandom(DELIST_STATUSES, DELIST_WEIGHTS);
    entries.push(buildEntry(prop, status, 'Active', occurredAt));
  });

  // Re-delist properties: Active→Withdrawn (day 5) → Active (day 15) → Withdrawn (day 25)
  // Each property contributes 1 "delisting" event visible to lead_events (the day-25 Withdrawn).
  // The day-5 Withdrawn is also a delisting. So each re-delist property produces 2 delisting events
  // but they have different occurred_at so the unique index allows both.
  reDelist.forEach((prop) => {
    // Event 1: Active → Withdrawn (day 5, small random jitter)
    const day5 = dayOffset(4 + Math.random(), windowStart);
    entries.push(buildEntry(prop, 'Withdrawn', 'Active', day5));

    // Event 2: Withdrawn → Active (day 15, not a delisting — just restore)
    const day15 = dayOffset(14 + Math.random(), windowStart);
    entries.push(buildEntry(prop, 'Active', 'Withdrawn', day15));

    // Event 3: Active → Withdrawn (day 25, second delisting)
    const day25 = dayOffset(24 + Math.random(), windowStart);
    entries.push(buildEntry(prop, 'Withdrawn', 'Active', day25));
  });

  // Sort by occurredAt so the Inngest function processes them in order
  entries.sort((a, b) => {
    const aTime = a.occurredAt instanceof Date ? a.occurredAt.getTime() : 0;
    const bTime = b.occurredAt instanceof Date ? b.occurredAt.getTime() : 0;
    return aTime - bTime;
  });

  console.log(`Generated ${entries.length} replay queue entries:`);

  // Count statuses
  const statusCounts: Record<string, number> = {};
  for (const e of entries) {
    statusCounts[e.newStatus] = (statusCounts[e.newStatus] ?? 0) + 1;
  }
  for (const [status, cnt] of Object.entries(statusCounts)) {
    console.log(`  ${status}: ${cnt}`);
  }

  // ── 5. Insert into replay_queue in batches ────────────────────────────────────
  const BATCH_SIZE = 50;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    await db.insert(replayQueue).values(entries.slice(i, i + BATCH_SIZE));
    inserted += Math.min(BATCH_SIZE, entries.length - i);
  }
  console.log(`Inserted ${inserted} entries into replay_queue.`);

  // ── 6. Trigger the Inngest function ──────────────────────────────────────────
  await triggerInngest();

  console.log('Done. Run `pnpm typecheck` or check Inngest dev server for processing status.');
}

async function triggerInngest() {
  const isDev = process.env.INNGEST_DEV === 'true';
  const baseUrl = isDev
    ? (process.env.INNGEST_BASE_URL ?? 'http://localhost:8288')
    : (process.env.INNGEST_EVENT_KEY
        ? 'https://inn.gs'
        : null);

  if (!baseUrl) {
    console.log(
      'Skipping Inngest trigger: set INNGEST_DEV=true (dev server) or INNGEST_EVENT_KEY (prod).',
    );
    return;
  }

  const eventKey = process.env.INNGEST_EVENT_KEY ?? 'local';

  try {
    const payload = {
      name: 'inngest/scheduled.timer',
      data: { triggered_by: 'replay-delistings' },
    };

    const url = isDev
      ? `${baseUrl}/e/${eventKey}`
      : `https://inn.gs/e/${eventKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`Triggered Inngest ingest-mls via ${url}`);
    } else {
      const body = await response.text();
      console.warn(`Inngest trigger returned ${response.status}: ${body}`);
      console.log('You can manually trigger by running: pnpm --filter web dev and visiting /api/inngest');
    }
  } catch (err) {
    console.warn('Could not reach Inngest server:', (err as Error).message);
    console.log('Start the Inngest Dev Server with: npx inngest-cli@latest dev');
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error('replay-delistings failed:', err);
  process.exit(1);
});
