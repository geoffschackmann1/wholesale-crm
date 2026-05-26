// Module 2 — MLS ingestion adapter interface
// Real MLS client is gated on broker onboarding; this file defines the contract.

export interface MlsAdapter {
  fetchStatusChanges(since: Date): Promise<MlsListing[]>;
}

export interface MlsListing {
  mlsListingId: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  currentListPrice?: number;
  daysOnMarket?: number;
  currentStatus: string;
  lastStatusChangeAt: Date;
}
