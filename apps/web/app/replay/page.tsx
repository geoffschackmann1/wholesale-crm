import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { replayQueue, sql, count, desc } from '@wholesale-crm/db';

export const dynamic = 'force-dynamic';

async function getReplayStats() {
  const db = getDb();
  if (!db) return null;

  try {
    const [[{ total }], [{ pending }], [{ processed }]] = await Promise.all([
      db.select({ total: count() }).from(replayQueue),
      db
        .select({ pending: count() })
        .from(replayQueue)
        .where(sql`${replayQueue.processedAt} IS NULL`),
      db
        .select({ processed: count() })
        .from(replayQueue)
        .where(sql`${replayQueue.processedAt} IS NOT NULL`),
    ]);

    const recentEvents = await db
      .select({
        id: replayQueue.id,
        mlsListingId: replayQueue.mlsListingId,
        newStatus: replayQueue.newStatus,
        prevStatus: replayQueue.prevStatus,
        occurredAt: replayQueue.occurredAt,
        processedAt: replayQueue.processedAt,
      })
      .from(replayQueue)
      .where(sql`${replayQueue.processedAt} IS NOT NULL`)
      .orderBy(desc(replayQueue.processedAt))
      .limit(20);

    return {
      total: Number(total),
      pending: Number(pending),
      processed: Number(processed),
      recentEvents,
    };
  } catch {
    return null;
  }
}

function formatDate(date: Date | null): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(date));
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Expired: 'bg-blue-100 text-blue-800',
    Withdrawn: 'bg-yellow-100 text-yellow-800',
    Cancelled: 'bg-gray-100 text-gray-700',
    Active: 'bg-green-100 text-green-800',
  };
  const cls = colors[status] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

export default async function ReplayPage() {
  const stats = await getReplayStats();

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <h1 className="text-2xl font-semibold text-gray-900">MLS Replay Stream</h1>
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
        <h1 className="text-2xl font-semibold text-gray-900">MLS Replay Stream</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Simulated 30-day MLS delisting stream — drives the alerting pipeline
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-gray-900">{stats.total.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Total queued</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{stats.processed.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">Processed</div>
          </CardContent>
        </Card>
      </div>

      {/* Trigger instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Trigger replay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-700">
            Run the replay seed script from the CLI to populate{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">replay_queue</code> and trigger the
            Inngest pipeline:
          </p>
          <pre className="bg-gray-900 text-gray-100 rounded-md px-4 py-3 text-sm overflow-x-auto">
            DATABASE_URL=... INNGEST_DEV=true pnpm replay
          </pre>
          <p className="text-xs text-gray-500">
            This generates 100 delisting events (50% Expired, 30% Withdrawn, 20% Cancelled) across a
            simulated 30-day window, plus 5 re-delist properties (Active → Withdrawn → Active →
            Withdrawn). After inserting, it calls the Inngest Dev Server to trigger{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">ingest-mls</code>.
          </p>
          <p className="text-xs text-gray-500">
            Make sure the Inngest Dev Server is running:{' '}
            <code className="bg-gray-100 px-1 rounded text-xs">npx inngest-cli@latest dev</code>
          </p>
        </CardContent>
      </Card>

      {/* Recent processed events */}
      <Card>
        <CardHeader>
          <CardTitle>Last 20 processed replay events</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recentEvents.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No processed events yet. Run <code className="bg-gray-100 px-1 rounded text-xs">pnpm replay</code> to start.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">MLS ID</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Prev status</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">New status</th>
                    <th className="text-left py-2 pr-4 font-medium text-gray-600">Occurred at</th>
                    <th className="text-left py-2 font-medium text-gray-600">Processed at</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentEvents.map((event) => (
                    <tr key={event.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-mono text-xs text-gray-700">
                        {event.mlsListingId}
                      </td>
                      <td className="py-2 pr-4">
                        {event.prevStatus ? <StatusBadge status={event.prevStatus} /> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={event.newStatus} />
                      </td>
                      <td className="py-2 pr-4 text-gray-600 text-xs whitespace-nowrap">
                        {formatDate(event.occurredAt)}
                      </td>
                      <td className="py-2 text-gray-600 text-xs whitespace-nowrap">
                        {formatDate(event.processedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
