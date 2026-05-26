import { getInboxLeads } from '../actions/inbox';
import { InboxClient } from './inbox-client';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const leads = await getInboxLeads(50);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          Delisted properties — newest first. Tap a row to see details.
        </p>
      </div>
      <InboxClient initialLeads={leads} />
    </div>
  );
}
