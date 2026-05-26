import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let _db: DrizzleDb | null = null;

// Returns null when DATABASE_URL is not set (lets the web app show a setup prompt).
export function getDb(): DrizzleDb | null {
  if (!process.env.DATABASE_URL) return null;
  if (!_db) {
    const client = postgres(process.env.DATABASE_URL);
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Throws immediately if DATABASE_URL is missing — use in scripts/jobs.
export function requireDb(): DrizzleDb {
  const db = getDb();
  if (!db) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
        'Copy .env.example to .env.local and fill in your Supabase connection string.',
    );
  }
  return db;
}

export type Db = DrizzleDb;
