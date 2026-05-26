'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { deleteBuyBox, toggleBuyBoxActive } from '@/app/actions/buy-boxes';

export function DeleteBuyBoxButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm('Delete this buy box and all its lead events?')) {
          startTransition(() => deleteBuyBox(id));
        }
      }}
      className="text-red-600 hover:text-red-700 hover:bg-red-50"
    >
      {pending ? '…' : 'Delete'}
    </Button>
  );
}

export function ToggleActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => toggleBuyBoxActive(id, !isActive))}
    >
      {pending ? '…' : isActive ? 'Pause' : 'Resume'}
    </Button>
  );
}
