'use client';

import Link from 'next/link';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import { cn } from '@/frontend/shared/cn';
import { APP_PRODUCTS, getAppProduct, type AppProduct } from './constants';

export function ProductSwitcher({ current }: { current: AppProduct }) {
  const active = getAppProduct(current);
  const ActiveIcon = active.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="تبديل المنتج"
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10">
            <ActiveIcon className="size-3.5 text-primary" />
          </span>
          <span className="text-sm font-semibold">{active.label}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-2xl p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
          منتجاتنا
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APP_PRODUCTS.map((product) => {
          const Icon = product.icon;
          const isActive = product.id === current;
          return (
            <DropdownMenuItem
              key={product.id}
              asChild
              className={cn(
                'rounded-xl px-2 py-2',
                isActive && 'bg-primary/10 focus:bg-primary/10'
              )}
            >
              <Link href={product.appPath}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4 text-foreground" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{product.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{product.tagline}</span>
                </span>
                {isActive && <Check className="size-4 shrink-0 text-primary" />}
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
