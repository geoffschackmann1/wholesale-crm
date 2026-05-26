export type BuyBoxCriteria = {
  counties?: string[];
  zips?: string[];
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  sqftMin?: number;
  equityPctMin?: number;
  ownerOccupied?: boolean;
  propertyTypes?: string[];
  exclusionList?: string[];
};

export type LeadEligibility = 'contactable' | 'watch_only' | 'held';

/**
 * Returns true if property matches the buy-box criteria.
 * equityPctMin and ownerOccupied are skipped (pass) when the enrichment data is null
 * (enrichment hasn't run yet). This is intentional — we gate contact actions, not the alert.
 */
export function propertyMatchesBuyBox(
  property: {
    id: string;
    county: string | null;
    zip: string;
    currentListPrice: number | null;
    beds: number | null;
    sqft: number | null;
    propertyType: string | null;
    equityPct?: number | null;
    ownerOccupiedFlag?: boolean | null;
  },
  buyBox: { criteriaJson: BuyBoxCriteria },
): boolean {
  const c = buyBox.criteriaJson;

  // Exclusion list — skip this property entirely
  if (c.exclusionList && c.exclusionList.includes(property.id)) {
    return false;
  }

  // County filter
  if (c.counties && c.counties.length > 0) {
    if (!property.county || !c.counties.includes(property.county)) {
      return false;
    }
  }

  // Zip filter
  if (c.zips && c.zips.length > 0) {
    if (!c.zips.includes(property.zip)) {
      return false;
    }
  }

  // Price min
  if (c.priceMin !== undefined && c.priceMin !== null) {
    if (property.currentListPrice === null || property.currentListPrice < c.priceMin) {
      return false;
    }
  }

  // Price max
  if (c.priceMax !== undefined && c.priceMax !== null) {
    if (property.currentListPrice === null || property.currentListPrice > c.priceMax) {
      return false;
    }
  }

  // Beds min
  if (c.bedsMin !== undefined && c.bedsMin !== null) {
    if (property.beds === null || property.beds < c.bedsMin) {
      return false;
    }
  }

  // Sqft min
  if (c.sqftMin !== undefined && c.sqftMin !== null) {
    if (property.sqft === null || property.sqft < c.sqftMin) {
      return false;
    }
  }

  // Property types filter
  if (c.propertyTypes && c.propertyTypes.length > 0) {
    if (!property.propertyType || !c.propertyTypes.includes(property.propertyType)) {
      return false;
    }
  }

  // equityPctMin — skip filter if equity_pct is null (enrichment not run yet)
  if (c.equityPctMin !== undefined && c.equityPctMin !== null) {
    if (property.equityPct !== undefined && property.equityPct !== null) {
      if (property.equityPct < c.equityPctMin) {
        return false;
      }
    }
    // if equityPct is null/undefined, we pass (enrichment not run yet)
  }

  // ownerOccupied — skip filter if owner data not present
  if (c.ownerOccupied !== undefined && c.ownerOccupied !== null) {
    if (property.ownerOccupiedFlag !== undefined && property.ownerOccupiedFlag !== null) {
      if (property.ownerOccupiedFlag !== c.ownerOccupied) {
        return false;
      }
    }
    // if ownerOccupiedFlag is null/undefined, we pass (enrichment not run yet)
  }

  return true;
}

/**
 * Derives lead eligibility from listing status.
 * Expired → contactable (listing agreement lapsed)
 * Cancelled → watch_only (ambiguous, may be relisted)
 * Withdrawn / anything else → held (still under listing agreement)
 */
export function deriveEligibility(status: string): LeadEligibility {
  if (status === 'Expired') return 'contactable';
  if (status === 'Cancelled') return 'watch_only';
  // Withdrawn / Temporarily-Off-Market / anything else delisted
  return 'held';
}
