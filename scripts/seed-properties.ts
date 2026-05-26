import { faker } from '@faker-js/faker';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@wholesale-crm/db/src/schema.js';
import { sql } from 'drizzle-orm';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const queryClient = postgres(process.env.DATABASE_URL);
const db = drizzle(queryClient, { schema });

const ZIPS = Array.from({ length: 20 }, (_, i) => String(10001 + i));
const PROPERTY_TYPES = ['SFR', 'MFR', 'condo', 'land'] as const;
const STATUSES = ['Active', 'Expired', 'Withdrawn', 'Cancelled', 'Sold'] as const;
const CITIES = ['New York', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
const COUNTIES = ['New York County', 'Kings County', 'Queens County', 'Bronx County', 'Richmond County'];

function weightedRandom<T>(items: readonly T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomDate(daysBack: number): Date {
  return new Date(Date.now() - Math.random() * daysBack * 24 * 60 * 60 * 1000);
}

export async function seedProperties(fresh = false) {
  if (fresh) {
    console.log('Truncating tables...');
    await db.execute(sql`TRUNCATE TABLE enrichment_jobs, lead_events, contacts, owners, property_status_history, properties RESTART IDENTITY CASCADE`);
  }

  console.log('Seeding 5,000 properties...');

  const BATCH_SIZE = 100;
  const TOTAL = 5000;

  for (let batch = 0; batch < TOTAL / BATCH_SIZE; batch++) {
    const propertyRows: (typeof schema.properties.$inferInsert)[] = [];
    const historyRows: (typeof schema.propertyStatusHistory.$inferInsert)[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      const zipIndex = (batch * BATCH_SIZE + i) % 20;
      const zip = ZIPS[zipIndex];
      const cityIndex = zipIndex % CITIES.length;

      const propertyType = weightedRandom(
        PROPERTY_TYPES,
        [0.70, 0.15, 0.10, 0.05],
      );

      const status = weightedRandom(
        STATUSES,
        [0.60, 0.15, 0.10, 0.05, 0.10],
      );

      const isLand = propertyType === 'land';
      const beds = isLand ? 0 : faker.number.int({ min: 2, max: 5 });
      const baths = isLand ? null : faker.number.float({ min: 1, max: 3, fractionDigits: 1 });
      const sqft = isLand ? null : faker.number.int({ min: 800, max: 4000 });
      const yearBuilt = isLand ? null : faker.number.int({ min: 1920, max: 2020 });
      const currentListPrice = faker.number.int({ min: 80000, max: 700000 });
      const daysOnMarket = faker.number.int({ min: 1, max: 180 });
      const lastStatusChangeAt = status !== 'Active' ? randomDate(30) : null;

      const id = crypto.randomUUID();

      propertyRows.push({
        id,
        addressLine1: faker.location.streetAddress(),
        addressLine2: Math.random() < 0.1 ? `Apt ${faker.number.int({ min: 1, max: 99 })}` : null,
        city: CITIES[cityIndex],
        state: 'NY',
        zip,
        county: COUNTIES[cityIndex],
        canonicalAddress: null,
        lat: faker.location.latitude({ min: 40.5, max: 40.9 }),
        lng: faker.location.longitude({ min: -74.3, max: -73.7 }),
        beds: beds,
        baths: baths,
        sqft: sqft,
        yearBuilt: yearBuilt,
        propertyType: propertyType,
        currentListPrice: currentListPrice,
        equityPct: null,
        arv: null,
        currentStatus: status,
        mlsListingId: faker.string.alphanumeric(10).toUpperCase(),
        daysOnMarket: daysOnMarket,
        lastStatusChangeAt: lastStatusChangeAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (status !== 'Active') {
        historyRows.push({
          id: crypto.randomUUID(),
          propertyId: id,
          status: status,
          source: 'seed',
          occurredAt: lastStatusChangeAt ?? new Date(),
          createdAt: new Date(),
        });
      }
    }

    await db.insert(schema.properties).values(propertyRows);

    if (historyRows.length > 0) {
      await db.insert(schema.propertyStatusHistory).values(historyRows);
    }

    if ((batch + 1) % 10 === 0) {
      console.log(`  Inserted ${(batch + 1) * BATCH_SIZE} properties...`);
    }
  }

  console.log('Seed complete: 5,000 properties inserted.');
  await queryClient.end();
}

// Run if called directly
const args = process.argv.slice(2);
const fresh = args.includes('--fresh');

seedProperties(fresh).catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
