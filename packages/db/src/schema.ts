import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import type { BuyBoxCriteria } from './buy-box.js';

// ─── properties ────────────────────────────────────────────────────────────────

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  addressLine1: text('address_line1').notNull(),
  addressLine2: text('address_line2'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zip: text('zip').notNull(),
  county: text('county'),
  canonicalAddress: text('canonical_address'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  beds: integer('beds'),
  baths: doublePrecision('baths'),
  sqft: integer('sqft'),
  yearBuilt: integer('year_built'),
  propertyType: text('property_type'),
  currentListPrice: integer('current_list_price'),
  equityPct: doublePrecision('equity_pct'),
  arv: integer('arv'),
  currentStatus: text('current_status').notNull(),
  mlsListingId: text('mls_listing_id'),
  daysOnMarket: integer('days_on_market'),
  lastStatusChangeAt: timestamp('last_status_change_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const propertiesRelations = relations(properties, ({ many }) => ({
  statusHistory: many(propertyStatusHistory),
  owners: many(owners),
  leadEvents: many(leadEvents),
  enrichmentJobs: many(enrichmentJobs),
}));

// ─── property_status_history ────────────────────────────────────────────────────

export const propertyStatusHistory = pgTable('property_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  source: text('source').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const propertyStatusHistoryRelations = relations(propertyStatusHistory, ({ one }) => ({
  property: one(properties, {
    fields: [propertyStatusHistory.propertyId],
    references: [properties.id],
  }),
}));

// ─── owners ─────────────────────────────────────────────────────────────────────

export const owners = pgTable('owners', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mailingAddressLine1: text('mailing_address_line1'),
  mailingAddressLine2: text('mailing_address_line2'),
  mailingCity: text('mailing_city'),
  mailingState: text('mailing_state'),
  mailingZip: text('mailing_zip'),
  ownerOccupiedFlag: boolean('owner_occupied_flag'),
  ownershipLengthYrs: doublePrecision('ownership_length_yrs'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const ownersRelations = relations(owners, ({ one, many }) => ({
  property: one(properties, {
    fields: [owners.propertyId],
    references: [properties.id],
  }),
  contacts: many(contacts),
}));

// ─── contacts ────────────────────────────────────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => owners.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  confidenceScore: doublePrecision('confidence_score'),
  dncStatus: text('dnc_status').default('unknown'),
  dncCheckedAt: timestamp('dnc_checked_at', { withTimezone: true }),
  isLikelyCell: boolean('is_likely_cell'),
  reassignedCheckedAt: timestamp('reassigned_checked_at', { withTimezone: true }),
  consentBasis: text('consent_basis'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contactsRelations = relations(contacts, ({ one }) => ({
  owner: one(owners, {
    fields: [contacts.ownerId],
    references: [owners.id],
  }),
}));

// ─── buy_boxes ────────────────────────────────────────────────────────────────────

export const buyBoxes = pgTable('buy_boxes', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  criteriaJson: jsonb('criteria_json').notNull().$type<BuyBoxCriteria>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const buyBoxesRelations = relations(buyBoxes, ({ many }) => ({
  leadEvents: many(leadEvents),
}));

// ─── lead_events ──────────────────────────────────────────────────────────────────

export const leadEvents = pgTable(
  'lead_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    buyBoxId: uuid('buy_box_id')
      .notNull()
      .references(() => buyBoxes.id, { onDelete: 'cascade' }),
    triggerType: text('trigger_type').notNull(),
    eligibility: text('eligibility').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lead_events_idempotency_idx').on(
      table.propertyId,
      table.buyBoxId,
      table.occurredAt,
    ),
  ],
);

export const leadEventsRelations = relations(leadEvents, ({ one }) => ({
  property: one(properties, {
    fields: [leadEvents.propertyId],
    references: [properties.id],
  }),
  buyBox: one(buyBoxes, {
    fields: [leadEvents.buyBoxId],
    references: [buyBoxes.id],
  }),
}));

// ─── replay_queue ─────────────────────────────────────────────────────────────────

export const replayQueue = pgTable('replay_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id'),
  // snapshot of the property at this point in the replay
  addressLine1: text('address_line1').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  zip: text('zip').notNull(),
  county: text('county'),
  beds: integer('beds'),
  baths: doublePrecision('baths'),
  sqft: integer('sqft'),
  yearBuilt: integer('year_built'),
  propertyType: text('property_type'),
  currentListPrice: integer('current_list_price'),
  daysOnMarket: integer('days_on_market'),
  mlsListingId: text('mls_listing_id').notNull(),
  newStatus: text('new_status').notNull(),
  prevStatus: text('prev_status'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ─── enrichment_jobs ──────────────────────────────────────────────────────────────

export const enrichmentJobs = pgTable('enrichment_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  status: text('status').default('pending').notNull(),
  responseJson: jsonb('response_json'),
  costCents: integer('cost_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const enrichmentJobsRelations = relations(enrichmentJobs, ({ one }) => ({
  property: one(properties, {
    fields: [enrichmentJobs.propertyId],
    references: [properties.id],
  }),
}));
