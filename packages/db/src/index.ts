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
