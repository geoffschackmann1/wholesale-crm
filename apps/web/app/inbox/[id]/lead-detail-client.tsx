'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LeadDetail } from '../../actions/inbox';
import { dismissLead, snoozeLead, markLeadSaved, triggerEnrichment } from '../../actions/inbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  if (eligibility === 'held') return 'Held — contact blocked';
  return eligibility;
}

function formatPrice(price: number | null): string {
  if (price == null) return 'N/A';
  return `$${price.toLocaleString()}`;
}

interface LeadDetailClientProps {
  lead: LeadDetail;
}

export function LeadDetailClient({ lead }: LeadDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enriching, setEnriching] = useState(false);
  const [enrichMessage, setEnrichMessage] = useState<string | null>(null);

  const isHeld = lead.eligibility === 'held';

  function handleDismiss() {
    startTransition(async () => {
      await dismissLead(lead.leadId);
      router.push('/inbox');
    });
  }

  function handleSnooze() {
    startTransition(async () => {
      await snoozeLead(lead.leadId);
      router.push('/inbox');
    });
  }

  function handleSave() {
    startTransition(async () => {
      await markLeadSaved(lead.leadId);
    });
  }

  function handleEnrich() {
    setEnriching(true);
    setEnrichMessage(null);
    triggerEnrichment(lead.leadId, lead.propertyId)
      .then(() => {
        setEnrichMessage('Enrichment triggered — owner info will appear shortly.');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setEnrichMessage(`Error: ${msg}`);
      })
      .finally(() => {
        setEnriching(false);
      });
  }

  return (
    <div className="space-y-6">
      {/* Property info */}
      <Card>
        <CardHeader>
          <CardTitle>{lead.addressLine1}</CardTitle>
          {lead.addressLine2 && (
            <p className="text-sm text-gray-500">{lead.addressLine2}</p>
          )}
          <p className="text-sm text-gray-500">
            {lead.city}, {lead.state} {lead.zip}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Eligibility */}
          <div className="flex items-center gap-3">
            <Badge variant={eligibilityVariant(lead.eligibility)}>
              {eligibilityLabel(lead.eligibility)}
            </Badge>
            <span className="text-sm text-gray-500">{lead.triggerType}</span>
          </div>

          {isHeld && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700 font-medium">
                Contact blocked — still under listing agreement.
              </p>
              <p className="text-xs text-red-600 mt-1">
                All contact actions are disabled for this property until the listing agreement expires.
              </p>
            </div>
          )}

          {/* Property details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            {lead.beds != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Beds</p>
                <p className="font-medium text-gray-900">{lead.beds}</p>
              </div>
            )}
            {lead.baths != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Baths</p>
                <p className="font-medium text-gray-900">{lead.baths}</p>
              </div>
            )}
            {lead.sqft != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Sqft</p>
                <p className="font-medium text-gray-900">{lead.sqft.toLocaleString()}</p>
              </div>
            )}
            {lead.yearBuilt != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Built</p>
                <p className="font-medium text-gray-900">{lead.yearBuilt}</p>
              </div>
            )}
            {lead.propertyType && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Type</p>
                <p className="font-medium text-gray-900">{lead.propertyType}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">List price</p>
              <p className="font-medium text-gray-900">{formatPrice(lead.currentListPrice)}</p>
            </div>
            {lead.daysOnMarket != null && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Days on market</p>
                <p className="font-medium text-gray-900">{lead.daysOnMarket}d</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Map embed placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Map</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.lat != null && lead.lng != null ? (
            <div className="rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center h-48 text-sm text-gray-600">
              <p>
                Coordinates: {lead.lat.toFixed(5)}, {lead.lng.toFixed(5)}
              </p>
            </div>
          ) : (
            <div className="rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center h-48 text-sm text-gray-400">
              Map not available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owner section */}
      <Card>
        <CardHeader>
          <CardTitle>Owner</CardTitle>
        </CardHeader>
        <CardContent>
          {lead.enriched ? (
            <div className="space-y-3">
              {lead.ownerName && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Name</p>
                  <p className="font-medium text-gray-900">{lead.ownerName}</p>
                </div>
              )}
              {(lead.mailingAddressLine1 || lead.mailingCity) && (
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Mailing address</p>
                  <p className="text-sm text-gray-700">
                    {lead.mailingAddressLine1}
                    {lead.mailingCity && `, ${lead.mailingCity}`}
                    {lead.mailingState && `, ${lead.mailingState}`}
                    {lead.mailingZip && ` ${lead.mailingZip}`}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">No owner info yet.</p>
              <Button
                size="sm"
                variant="outline"
                disabled={enriching || isPending}
                onClick={handleEnrich}
              >
                {enriching ? 'Triggering...' : 'Enrich now'}
              </Button>
              {enrichMessage && (
                <p className="text-xs text-gray-600">{enrichMessage}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contacts section */}
      {!isHeld && (
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            {lead.phones.length === 0 && lead.emails.length === 0 ? (
              <p className="text-sm text-gray-500">No contacts yet.</p>
            ) : (
              <div className="space-y-3">
                {lead.phones.map((phone) => (
                  <div key={phone.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-900 font-mono">{phone.value}</span>
                    {phone.dncStatus === 'unknown' && (
                      <span className="text-xs text-yellow-600">DNC/RND not yet checked</span>
                    )}
                    {phone.dncStatus === 'dnc' && (
                      <span className="text-xs text-red-600">DNC</span>
                    )}
                    {phone.isLikelyCell && (
                      <span className="text-xs text-blue-600">Cell</span>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <a
                        href={`tel:${phone.value}`}
                        className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-md bg-gray-900 text-white hover:bg-gray-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Call
                      </a>
                      <a
                        href={`sms:${phone.value}`}
                        className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-md border border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Text
                      </a>
                    </div>
                  </div>
                ))}
                {lead.emails.map((email) => (
                  <div key={email.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-900">{email.value}</span>
                    <a
                      href={`mailto:${email.value}`}
                      className="ml-auto text-xs text-gray-500 hover:text-gray-900"
                    >
                      Email
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Contact blocked section for held leads */}
      {isHeld && lead.enriched && (
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">
                Contact actions disabled — property is still under listing agreement.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action bar */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={handleSnooze}
        >
          Snooze 7 days
        </Button>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={handleDismiss}
          className="text-red-600 hover:bg-red-50"
        >
          Dismiss
        </Button>
        <Button
          disabled={isPending}
          onClick={handleSave}
          className="ml-auto"
        >
          Mark saved
        </Button>
      </div>
    </div>
  );
}
