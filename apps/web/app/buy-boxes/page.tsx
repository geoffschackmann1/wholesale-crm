import Link from 'next/link';
import { eq, count } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { buyBoxes, leadEvents } from '@wholesale-crm/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteBuyBoxButton, ToggleActiveButton } from './client-buttons';
import type { BuyBoxCriteria } from '@wholesale-crm/db';

export const dynamic = 'force-dynamic';

export default async function BuyBoxesPage() {
  const db = await getDb();

  if (!db) {
    return (
      <p className="text-gray-500">
        Database not configured. Set <code>DATABASE_URL</code> in .env.local.
      </p>
    );
  }

  const rows = await db
    .select({
      id: buyBoxes.id,
      name: buyBoxes.name,
      isActive: buyBoxes.isActive,
      criteriaJson: buyBoxes.criteriaJson,
      createdAt: buyBoxes.createdAt,
      leadCount: count(leadEvents.id),
    })
    .from(buyBoxes)
    .leftJoin(leadEvents, eq(buyBoxes.id, leadEvents.buyBoxId))
    .groupBy(buyBoxes.id, buyBoxes.name, buyBoxes.isActive, buyBoxes.criteriaJson, buyBoxes.createdAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Buy Boxes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Define the criteria used to match delisted properties to alerts.
          </p>
        </div>
        <Button asChild>
          <Link href="/buy-boxes/new">+ New buy box</Link>
        </Button>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No buy boxes yet.{' '}
            <Link href="/buy-boxes/new" className="text-gray-900 underline">
              Create one
            </Link>{' '}
            to start matching delisted properties.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((box) => (
            <Card key={box.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/buy-boxes/${box.id}`}
                        className="font-medium text-gray-900 hover:underline truncate"
                      >
                        {box.name}
                      </Link>
                      <Badge variant={box.isActive ? 'active' : 'inactive'}>
                        {box.isActive ? 'Active' : 'Paused'}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {box.leadCount} lead{box.leadCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {summarizeCriteria(box.criteriaJson as BuyBoxCriteria)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ToggleActiveButton id={box.id} isActive={box.isActive} />
                    <DeleteBuyBoxButton id={box.id} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function summarizeCriteria(c: BuyBoxCriteria): string {
  const parts: string[] = [];
  if (c.zips?.length) parts.push(`zips: ${c.zips.slice(0, 3).join(', ')}${c.zips.length > 3 ? `+${c.zips.length - 3}` : ''}`);
  if (c.counties?.length) parts.push(`counties: ${c.counties.join(', ')}`);
  if (c.priceMin != null) parts.push(`≥$${c.priceMin.toLocaleString()}`);
  if (c.priceMax != null) parts.push(`≤$${c.priceMax.toLocaleString()}`);
  if (c.bedsMin != null) parts.push(`${c.bedsMin}+ beds`);
  if (c.sqftMin != null) parts.push(`${c.sqftMin.toLocaleString()}+ sqft`);
  if (c.propertyTypes?.length) parts.push(c.propertyTypes.join('/'));
  return parts.length ? parts.join(' · ') : 'No filters — matches all properties';
}
