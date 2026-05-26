import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getLeadDetail } from '../../actions/inbox';
import { LeadDetailClient } from './lead-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const lead = await getLeadDetail(id);

  if (!lead) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/inbox"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          &larr; Back to Inbox
        </Link>
      </div>
      <LeadDetailClient lead={lead} />
    </div>
  );
}
