'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { buyBoxes } from '@wholesale-crm/db';
import type { BuyBoxCriteria } from '@wholesale-crm/db';

export async function createBuyBox(formData: FormData) {
  const db = await getDb();
  if (!db) throw new Error('DB not configured');

  const name = (formData.get('name') as string | null)?.trim();
  if (!name) throw new Error('Name is required');

  const zipsRaw = (formData.get('zips') as string | null)?.trim() ?? '';
  const countiesRaw = (formData.get('counties') as string | null)?.trim() ?? '';
  const priceMinRaw = formData.get('priceMin');
  const priceMaxRaw = formData.get('priceMax');
  const bedsMinRaw = formData.get('bedsMin');
  const sqftMinRaw = formData.get('sqftMin');
  const propertyTypesRaw = formData.getAll('propertyTypes') as string[];

  const criteria: BuyBoxCriteria = {};

  const zips = zipsRaw.split(',').map((z) => z.trim()).filter(Boolean);
  if (zips.length > 0) criteria.zips = zips;

  const counties = countiesRaw.split(',').map((c) => c.trim()).filter(Boolean);
  if (counties.length > 0) criteria.counties = counties;

  if (priceMinRaw) criteria.priceMin = Number(priceMinRaw);
  if (priceMaxRaw) criteria.priceMax = Number(priceMaxRaw);
  if (bedsMinRaw) criteria.bedsMin = Number(bedsMinRaw);
  if (sqftMinRaw) criteria.sqftMin = Number(sqftMinRaw);
  if (propertyTypesRaw.length > 0) criteria.propertyTypes = propertyTypesRaw;

  await db.insert(buyBoxes).values({
    id: crypto.randomUUID(),
    name,
    isActive: true,
    criteriaJson: criteria,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath('/buy-boxes');
  redirect('/buy-boxes');
}

export async function deleteBuyBox(id: string) {
  const db = await getDb();
  if (!db) throw new Error('DB not configured');
  await db.delete(buyBoxes).where(eq(buyBoxes.id, id));
  revalidatePath('/buy-boxes');
}

export async function toggleBuyBoxActive(id: string, isActive: boolean) {
  const db = await getDb();
  if (!db) throw new Error('DB not configured');
  await db.update(buyBoxes).set({ isActive, updatedAt: new Date() }).where(eq(buyBoxes.id, id));
  revalidatePath('/buy-boxes');
}
