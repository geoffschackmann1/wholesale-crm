import { count, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { properties, leadEvents, buyBoxes, enrichmentJobs } from '@wholesale-crm/db';

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return null;

  try {
    const [[{ totalProperties }], [{ totalLeadEvents }], [{ activeBuyBoxes }], [{ pendingEnrichment }]] =
      await Promise.all([
        db.select({ totalProperties: count() }).from(properties),
        db.select({ totalLeadEvents: count() }).from(leadEvents),
        db.select({ activeBuyBoxes: count() }).from(buyBoxes).where(eq(buyBoxes.isActive, true)),
        db
          .select({ pendingEnrichment: count() })
          .from(enrichmentJobs)
          .where(eq(enrichmentJobs.status, 'pending')),
      ]);

    const eligibilityCounts = await db
      .select({ eligibility: leadEvents.eligibility, cnt: count() })
      .from(leadEvents)
      .groupBy(leadEvents.eligibility);

    const byEligibility = Object.fromEntries(eligibilityCounts.map((r) => [r.eligibility, Number(r.cnt)]));

    return {
      totalProperties: Number(totalProperties),
      totalLeadEvents: Number(totalLeadEvents),
      activeBuyBoxes: Number(activeBuyBoxes),
      pendingEnrichment: Number(pendingEnrichment),
      contactable: byEligibility['contactable'] ?? 0,
      watchOnly: byEligibility['watch_only'] ?? 0,
      held: byEligibility['held'] ?? 0,
    };
  } catch {
    return null;
  }
}
