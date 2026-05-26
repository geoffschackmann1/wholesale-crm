import { notFound } from 'next/navigation';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { buyBoxes, leadEvents, properties } from '@wholesale-crm/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { BuyBoxCriteria } from '@wholesale-crm/db';

export const dynamic = 'force-dynamic';

interface Props {
  params: { id: string };
}

export default async function BuyBoxDetailPage({ params }: Props) {
  const db = await getDb();
  if (!db) return <p>DB not configured.</p>;

  const [box] = await db.select().from(buyBoxes).where(eq(buyBoxes.id, params.id)).limit(1);
  if (!box) notFound();

  const events = await db
    .select({
      id: leadEvents.id,
      eligibility: leadEvents.eligibility,
      triggerType: leadEvents.triggerType,
      occurredAt: leadEvents.occurredAt,
      dismissedAt: leadEvents.dismissedAt,
      addressLine1: properties.addressLine1,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      currentListPrice: properties.currentListPrice,
      beds: properties.beds,
      propertyType: properties.propertyType,
    })
    .from(leadEvents)
    .innerJoin(properties, eq(leadEvents.propertyId, properties.id))
    .where(eq(leadEvents.buyBoxId, params.id))
    .orderBy(desc(leadEvents.occurredAt))
    .limit(100);

  const criteria = box.criteriaJson as BuyBoxCriteria;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{box.name}</h1>
            <Badge variant={box.isActive ? 'active' : 'inactive'}>
              {box.isActive ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Created {new Date(box.createdAt).toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/buy-boxes">← Back</Link>
        </Button>
      </div>

      {/* Criteria */}
      <Card>
        <CardHeader>
          <CardTitle>Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <CriteriaRow label="ZIPs" value={criteria.zips?.join(', ') ?? 'All'} />
            <CriteriaRow label="Counties" value={criteria.counties?.join(', ') ?? 'All'} />
            <CriteriaRow label="Min price" value={criteria.priceMin != null ? `$${criteria.priceMin.toLocaleString()}` : 'None'} />
            <CriteriaRow label="Max price" value={criteria.priceMax != null ? `$${criteria.priceMax.toLocaleString()}` : 'None'} />
            <CriteriaRow label="Min beds" value={criteria.bedsMin != null ? String(criteria.bedsMin) : 'None'} />
            <CriteriaRow label="Min sqft" value={criteria.sqftMin != null ? criteria.sqftMin.toLocaleString() : 'None'} />
            <CriteriaRow label="Property types" value={criteria.propertyTypes?.join(', ') ?? 'All'} />
          </dl>
        </CardContent>
      </Card>

      {/* Lead events */}
      <Card>
        <CardHeader>
          <CardTitle>Matching lead events {events.length > 0 && `(${events.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">
              No lead events yet. Run the seed + acceptance test to populate.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="pb-2 pr-4">Address</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Eligibility</th>
                    <th className="pb-2 pr-4">Price</th>
                    <th className="pb-2">Occurred</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 pr-4 font-medium">
                        {e.addressLine1}, {e.city} {e.zip}
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">{e.triggerType}</td>
                      <td className="py-2.5 pr-4">
                        <Badge
                          variant={
                            e.eligibility === 'contactable'
                              ? 'contactable'
                              : e.eligibility === 'watch_only'
                              ? 'watchOnly'
                              : 'held'
                          }
                        >
                          {e.eligibility}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-gray-600">
                        {e.currentListPrice != null ? `$${e.currentListPrice.toLocaleString()}` : '—'}
                      </td>
                      <td className="py-2.5 text-gray-400 text-xs">
                        {new Date(e.occurredAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {events.length === 100 && (
                <p className="text-xs text-gray-400 mt-3">Showing newest 100 events.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CriteriaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-400 text-xs uppercase tracking-wide">{label}</dt>
      <dd className="text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
