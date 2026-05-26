'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { InboxLead } from '../actions/inbox';
import { dismissLead, snoozeLead, markLeadSaved } from '../actions/inbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function eligibilityVariant(
  eligibility: string,
): 'contactable' | 'watch_only' | 'held' | 'default' {
  if (eligibility === 'contactable') return 'contactable';
  if (eligibility === 'watch_only') return 'watch_only';
  if (eligibility === 'held') return 'held';
  return 'default';
}

function eligibilityLabel(eligibility: string): string {
  if (eligibility === 'contactable') return 'Contactable';
  if (eligibility === 'watch_only') return 'Watch only';
  if (eligibility === 'held') return 'Held';
  return eligibility;
}

function formatDom(dom: number | null): string {
  if (dom == null) return '';
  return `${dom}d on market`;
}

function formatPrice(price: number | null): string {
  if (price == null) return '';
  return `$${price.toLocaleString()}`;
}

interface InboxCardProps {
  lead: InboxLead;
  onRemove: (id: string) => void;
}

function InboxCard({ lead, onRemove }: InboxCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isHeld = lead.eligibility === 'held';

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await dismissLead(lead.id);
      onRemove(lead.id);
    });
  }

  function handleSnooze(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await snoozeLead(lead.id);
      onRemove(lead.id);
    });
  }

  function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      await markLeadSaved(lead.id);
    });
  }

  function handleRowClick() {
    router.push(`/inbox/${lead.id}`);
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={handleRowClick}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Address */}
            <p className="font-medium text-gray-900 truncate">
              {lead.addressLine1}
            </p>
            <p className="text-sm text-gray-500">
              {lead.city}, {lead.state} {lead.zip}
            </p>

            {/* Badges + meta */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant={eligibilityVariant(lead.eligibility)}>
                {eligibilityLabel(lead.eligibility)}
              </Badge>
              <span className="text-xs text-gray-500">{lead.triggerType}</span>
              {lead.daysOnMarket != null && (
                <span className="text-xs text-gray-400">{formatDom(lead.daysOnMarket)}</span>
              )}
              {lead.currentListPrice != null && (
                <span className="text-xs text-gray-400">{formatPrice(lead.currentListPrice)}</span>
              )}
            </div>

            {/* Owner + phone */}
            {lead.ownerName && (
              <p className="text-sm text-gray-700 mt-1">{lead.ownerName}</p>
            )}
            {lead.topPhone && !isHeld && (
              <p className="text-xs text-gray-500 mt-0.5">{lead.topPhone}</p>
            )}

            {/* Compliance warning for held leads */}
            {isHeld && (
              <p className="text-xs text-red-600 font-medium mt-1">
                Contact blocked — still under listing agreement.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={handleSave}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleSnooze}
            >
              Snooze 7d
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleDismiss}
              className="text-red-600 hover:bg-red-50"
            >
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface InboxClientProps {
  initialLeads: InboxLead[];
}

export function InboxClient({ initialLeads }: InboxClientProps) {
  const [leads, setLeads] = useState<InboxLead[]>(initialLeads);

  function handleRemove(id: string) {
    setLeads((prev) => prev.filter((l) => l.id !== id));
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg font-medium">Inbox is empty</p>
        <p className="text-sm mt-1">New delisted properties will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <InboxCard key={lead.id} lead={lead} onRemove={handleRemove} />
      ))}
    </div>
  );
}
