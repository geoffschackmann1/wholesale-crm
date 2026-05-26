// Schema tables
export {
  properties,
  propertiesRelations,
  propertyStatusHistory,
  propertyStatusHistoryRelations,
  owners,
  ownersRelations,
  contacts,
  contactsRelations,
  buyBoxes,
  buyBoxesRelations,
  leadEvents,
  leadEventsRelations,
  enrichmentJobs,
  enrichmentJobsRelations,
  replayQueue,
} from './schema.js';

// Buy-box engine
export {
  propertyMatchesBuyBox,
  deriveEligibility,
} from './buy-box.js';

export type { BuyBoxCriteria, LeadEligibility } from './buy-box.js';

// DB client
export { getDb, requireDb } from './client.js';
export type { Db } from './client.js';

// Re-export drizzle helpers so consumers don't need drizzle-orm as a direct dep
export { sql, eq, inArray, count, desc, and, or, asc } from 'drizzle-orm';
