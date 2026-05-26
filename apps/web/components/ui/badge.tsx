import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-800',
        contactable: 'bg-green-100 text-green-800',
        watch_only: 'bg-yellow-100 text-yellow-800',
        watchOnly: 'bg-yellow-100 text-yellow-800',
        held: 'bg-red-100 text-red-800',
        active: 'bg-blue-100 text-blue-800',
        inactive: 'bg-gray-100 text-gray-500',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
