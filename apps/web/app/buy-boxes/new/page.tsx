import { createBuyBox } from '@/app/actions/buy-boxes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

export default function NewBuyBoxPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">New buy box</h1>
        <p className="text-sm text-gray-500 mt-1">
          Define the criteria for matching delisted properties to alerts.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form action={createBuyBox} className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" placeholder="e.g. Affordable SFR — Bronx" required />
            </div>

            {/* Geography */}
            <fieldset className="space-y-4 border border-gray-200 rounded-md p-4">
              <legend className="text-sm font-medium text-gray-700 px-1">Geography</legend>
              <div className="space-y-1.5">
                <Label htmlFor="zips">ZIP codes</Label>
                <Input
                  id="zips"
                  name="zips"
                  placeholder="10001, 10002, 10003"
                />
                <p className="text-xs text-gray-400">Comma-separated. Leave blank to match all ZIPs.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="counties">Counties</Label>
                <Input
                  id="counties"
                  name="counties"
                  placeholder="Kings County, Queens County"
                />
                <p className="text-xs text-gray-400">Comma-separated. Leave blank to match all counties.</p>
              </div>
            </fieldset>

            {/* Price */}
            <fieldset className="space-y-4 border border-gray-200 rounded-md p-4">
              <legend className="text-sm font-medium text-gray-700 px-1">Price range</legend>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="priceMin">Min price ($)</Label>
                  <Input id="priceMin" name="priceMin" type="number" min={0} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="priceMax">Max price ($)</Label>
                  <Input id="priceMax" name="priceMax" type="number" min={0} placeholder="500000" />
                </div>
              </div>
            </fieldset>

            {/* Property details */}
            <fieldset className="space-y-4 border border-gray-200 rounded-md p-4">
              <legend className="text-sm font-medium text-gray-700 px-1">Property details</legend>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bedsMin">Min bedrooms</Label>
                  <Input id="bedsMin" name="bedsMin" type="number" min={0} max={10} placeholder="2" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sqftMin">Min sq ft</Label>
                  <Input id="sqftMin" name="sqftMin" type="number" min={0} placeholder="1000" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Property types</Label>
                <div className="flex flex-wrap gap-4">
                  {(['SFR', 'MFR', 'condo', 'land'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" name="propertyTypes" value={t} className="rounded" />
                      {t}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-400">Leave all unchecked to match all types.</p>
              </div>
            </fieldset>

            <div className="flex gap-3 pt-2">
              <Button type="submit">Create buy box</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/buy-boxes">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
