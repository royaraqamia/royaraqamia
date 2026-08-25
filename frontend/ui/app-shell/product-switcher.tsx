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
          aria-label="تبديل"
          className={cn(
            'group relative inline-flex h-10 items-center justify-between gap-2.5 rounded-full border border-border/50 bg-background/80 px-3.5 py-1.5 text-sm font-medium text-foreground backdrop-blur-md shadow-xs transition-all duration-200 ease-out',
            'hover:border-border hover:bg-accent/50 hover:shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'active:scale-[0.98]',
            'data-[state=open]:border-primary/40 data-[state=open]:bg-accent/60 data-[state=open]:shadow-sm'
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-200 group-hover:scale-105">
            <ActiveIcon className="size-3.5" />
          </span>
          <span className="max-w-35 truncate font-semibold tracking-tight text-foreground/90 sm:max-w-none group-hover:text-foreground">
            {active.label}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/70 transition-all duration-300 group-hover:text-foreground group-data-[state=open]:rotate-180 group-data-[state=open]:text-foreground" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 sm:w-80 rounded-2xl border border-border/50 bg-popover/90 p-1.5 shadow-2xl shadow-black/10 backdrop-blur-2xl transition-transform duration-200 animate-in fade-in-0 zoom-in-95"
      >
        <DropdownMenuLabel className="px-3 py-2 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          منتجاتنا
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1 -mx-1 bg-border/40" />

        <div className="space-y-0.5 p-0.5">
          {APP_PRODUCTS.map((product) => {
            const Icon = product.icon;
            const isActive = product.id === current;
            return (
              <DropdownMenuItem key={product.id} asChild className="p-0 focus:bg-transparent">
                <Link
                  href={product.appPath}
                  className={cn(
                    'group/item relative flex items-center gap-3 rounded-xl p-2.5 transition-all duration-200 outline-none select-none',
                    'hover:bg-accent/70 focus-visible:bg-accent/80 active:scale-[0.99]',
                    isActive
                      ? 'bg-primary/10 text-primary hover:bg-primary/15 focus-visible:bg-primary/15 border border-primary/20 shadow-xs'
                      : 'border border-transparent hover:border-border/30'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-all duration-200',
                      isActive
                        ? 'border-primary/30 bg-primary/20 text-primary shadow-xs'
                        : 'border-border/40 bg-muted/60 text-muted-foreground group-hover/item:border-border group-hover/item:bg-background group-hover/item:text-foreground'
                    )}
                  >
                    <Icon className="size-4 transition-transform duration-200 group-hover/item:scale-110" />
                  </span>

                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm font-semibold leading-snug tracking-tight transition-colors duration-200',
                      isActive
                        ? 'text-foreground'
                        : 'text-foreground/90 group-hover/item:text-foreground'
                    )}
                  >
                    {product.label}
                  </span>

                  {isActive && (
                    <span className="ms-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                      <Check className="size-3.5 stroke-[2.5]" />
                    </span>
                  )}
                </Link>
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
