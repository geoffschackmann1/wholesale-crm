// BatchData API adapter
// Docs: https://developer.batchdata.com (not publicly accessible — use env vars)
//
// Two operations:
//   propertyLookup(address) → PropertyLookupResult
//   skipTrace(address)      → SkipTraceResult
//
// When BATCHDATA_API_KEY is not set, both methods return deterministic mock data
// based on the address string so development works without a live account.

export type PropertyLookupResult = {
  ownerName: string;
  mailingAddressLine1: string;
  mailingCity: string;
  mailingState: string;
  mailingZip: string;
  ownerOccupied: boolean | null;
  ownershipLengthYrs: number | null;
  estimatedEquityPct: number | null;
  arv: number | null; // after-repair value
};

export type SkipTraceResult = {
  phones: Array<{ number: string; confidence: number; isLikelyCell: boolean }>;
  emails: Array<{ address: string; confidence: number }>;
};

// ── Address shape passed to both operations ───────────────────────────────────

export type PropertyAddress = {
  line1: string;
  city: string;
  state: string;
  zip: string;
};

// ── Deterministic mock helpers ────────────────────────────────────────────────

/** Simple hash over a string to get a stable integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function mockPropertyLookup(address: PropertyAddress): PropertyLookupResult {
  const seed = hashString(`${address.line1}|${address.zip}`);
  const ownerNames = [
    'James A. Wilson',
    'Patricia K. Moore',
    'Robert J. Taylor',
    'Linda C. Anderson',
    'Michael B. Thomas',
    'Barbara E. Jackson',
    'William H. White',
    'Elizabeth S. Harris',
    'David R. Martinez',
    'Susan L. Thompson',
  ];
  const ownerName = ownerNames[seed % ownerNames.length] ?? 'John A. Doe';
  const equityPct = 20 + (seed % 60); // 20–79 %
  const arv = 150_000 + (seed % 500) * 500; // $150 k – $400 k

  return {
    ownerName,
    mailingAddressLine1: address.line1,
    mailingCity: address.city,
    mailingState: address.state,
    mailingZip: address.zip,
    ownerOccupied: seed % 3 !== 0,
    ownershipLengthYrs: 1 + (seed % 20),
    estimatedEquityPct: equityPct,
    arv,
  };
}

function mockSkipTrace(address: PropertyAddress): SkipTraceResult {
  const seed = hashString(`skip|${address.line1}|${address.zip}`);
  const areaCode = 200 + (seed % 800);
  const line = 1000000 + ((seed * 7919) % 9000000);
  const phones = [
    {
      number: `+1${areaCode}${String(line).slice(0, 7)}`,
      confidence: 0.6 + (seed % 40) / 100,
      isLikelyCell: seed % 2 === 0,
    },
    {
      number: `+1${areaCode + 1}${String(line + 111).slice(0, 7)}`,
      confidence: 0.4 + (seed % 30) / 100,
      isLikelyCell: seed % 2 !== 0,
    },
  ];
  const emails = [
    {
      address: `owner${seed % 9999}@example.com`,
      confidence: 0.5 + (seed % 45) / 100,
    },
  ];
  return { phones, emails };
}

// ── Real API calls ────────────────────────────────────────────────────────────

type BatchDataPropertyLookupApiResponse = {
  results?: Array<{
    propertyInfo?: {
      ownerInfo?: {
        ownerName?: string;
        mailingAddress?: {
          address?: string;
          city?: string;
          state?: string;
          zip?: string;
        };
        ownerOccupied?: boolean;
        yearsOwned?: number;
      };
      estimatedEquity?: number; // as a percentage 0–100
      estimatedValue?: number;
    };
  }>;
};

type BatchDataSkipTraceApiResponse = {
  results?: Array<{
    phoneNumbers?: Array<{
      phone?: string;
      confidence?: number;
      isCell?: boolean;
    }>;
    emails?: Array<{
      email?: string;
      confidence?: number;
    }>;
  }>;
};

async function realPropertyLookup(
  address: PropertyAddress,
  apiKey: string,
): Promise<PropertyLookupResult> {
  const response = await fetch('https://api.batchdata.com/api/v1/property/lookup', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          address: {
            street: address.line1,
            city: address.city,
            state: address.state,
            zip: address.zip,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`BatchData property lookup failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BatchDataPropertyLookupApiResponse;
  const result = data.results?.[0];
  const ownerInfo = result?.propertyInfo?.ownerInfo;
  const mailing = ownerInfo?.mailingAddress;

  return {
    ownerName: ownerInfo?.ownerName ?? 'Unknown Owner',
    mailingAddressLine1: mailing?.address ?? address.line1,
    mailingCity: mailing?.city ?? address.city,
    mailingState: mailing?.state ?? address.state,
    mailingZip: mailing?.zip ?? address.zip,
    ownerOccupied: ownerInfo?.ownerOccupied ?? null,
    ownershipLengthYrs: ownerInfo?.yearsOwned ?? null,
    estimatedEquityPct: result?.propertyInfo?.estimatedEquity ?? null,
    arv: result?.propertyInfo?.estimatedValue ?? null,
  };
}

async function realSkipTrace(
  address: PropertyAddress,
  apiKey: string,
): Promise<SkipTraceResult> {
  const response = await fetch('https://api.batchdata.com/api/v1/person/skip-trace', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          address: {
            street: address.line1,
            city: address.city,
            state: address.state,
            zip: address.zip,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`BatchData skip trace failed: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as BatchDataSkipTraceApiResponse;
  const result = data.results?.[0];

  const phones = (result?.phoneNumbers ?? [])
    .slice(0, 5)
    .map((p) => ({
      number: p.phone ?? '',
      confidence: p.confidence ?? 0,
      isLikelyCell: p.isCell ?? false,
    }))
    .filter((p) => p.number.length > 0);

  const emails = (result?.emails ?? [])
    .slice(0, 2)
    .map((e) => ({
      address: e.email ?? '',
      confidence: e.confidence ?? 0,
    }))
    .filter((e) => e.address.length > 0);

  return { phones, emails };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Looks up property ownership data via BatchData.
 * Falls back to deterministic mock data when BATCHDATA_API_KEY is not set.
 *
 * Approximate cost: $0.07–$0.15 per call (log as 1000 millicents / ~10 cents).
 */
export async function batchdataPropertyLookup(
  address: PropertyAddress,
): Promise<PropertyLookupResult> {
  const apiKey = process.env['BATCHDATA_API_KEY'];
  if (!apiKey) {
    return mockPropertyLookup(address);
  }
  return realPropertyLookup(address, apiKey);
}

/**
 * Runs skip-trace via BatchData to find phones + emails for the property owner.
 * Falls back to deterministic mock data when BATCHDATA_API_KEY is not set.
 *
 * Approximate cost: $0.07–$0.15 per call (log as 1000 millicents / ~10 cents).
 */
export async function batchdataSkipTrace(address: PropertyAddress): Promise<SkipTraceResult> {
  const apiKey = process.env['BATCHDATA_API_KEY'];
  if (!apiKey) {
    return mockSkipTrace(address);
  }
  return realSkipTrace(address, apiKey);
}
