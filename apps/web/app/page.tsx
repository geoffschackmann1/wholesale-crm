import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDashboardStats } from './actions/dashboard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">Wholesale CRM</h1>
        <p className="text-gray-500 text-center max-w-md">
          Database not configured. Set{' '}
          <code className="bg-gray-100 px-1 rounded text-sm">DATABASE_URL</code> in{' '}
          <code className="bg-gray-100 px-1 rounded text-sm">.env.local</code> and restart.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Property warehouse + buy-box summary</p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total properties" value={stats.totalProperties.toLocaleString()} />
        <StatCard
          label="Delisted (active buy-box)"
          value={stats.totalLeadEvents.toLocaleString()}
        />
        <StatCard label="Buy boxes" value={stats.activeBuyBoxes.toLocaleString()} />
        <StatCard label="Pending enrichment" value={stats.pendingEnrichment.toLocaleString()} />
      </div>

      {/* Lead events by eligibility */}
      <Card>
        <CardHeader>
          <CardTitle>Lead events by eligibility</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <EligibilityRow
              label="Contactable (Expired)"
              count={stats.contactable}
              variant="contactable"
            />
            <EligibilityRow
              label="Watch only (Cancelled)"
              count={stats.watchOnly}
              variant="watchOnly"
            />
            <EligibilityRow
              label="Held (Withdrawn)"
              count={stats.held}
              variant="held"
            />
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Expired = contactable · Cancelled = watch-only · Withdrawn = held (still under listing
            agreement, contact blocked)
          </p>
        </CardContent>
      </Card>

      {/* Quick links */}
      <div className="flex gap-3">
        <Link
          href="/buy-boxes"
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Manage buy boxes
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500 mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function EligibilityRow({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: 'contactable' | 'watchOnly' | 'held';
}) {
  return (
    <div className="flex items-center gap-3 min-w-48">
      <Badge variant={variant} />
      <span className="text-sm text-gray-700">{label}</span>
      <span className="ml-auto font-semibold text-gray-900">{count.toLocaleString()}</span>
    </div>
  );
}
