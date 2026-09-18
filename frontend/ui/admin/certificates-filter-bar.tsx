'use client';

import { Filter, Search } from 'lucide-react';
import { Input } from '@/frontend/ui/primitives/input';
import { cn } from '@/frontend/shared/cn';

export type StatusFilter = 'all' | 'valid' | 'expired';

const FILTERS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'valid', label: 'صالحة' },
  { value: 'expired', label: 'منتهية' },
];

interface CertificatesFilterBarProps {
  search: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
  /** Primary action (e.g. the "new certificate" button) rendered beside the search on desktop. */
  action?: React.ReactNode;
}

export function CertificatesFilterBar({
  search,
  statusFilter,
  onSearchChange,
  onSearchSubmit,
  onStatusFilterChange,
  action,
}: CertificatesFilterBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:mb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit();
          }}
          role="search"
          className="relative w-full sm:max-w-sm"
        >
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 inset-s-3.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="بحث بالاسم أو الرمز..."
            aria-label="بحث في الشهادات"
            className="ps-10"
          />
        </form>

        {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="تصفية الحالة">
        <Filter className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
        {FILTERS.map((filter) => {
          const active = statusFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={active}
              onClick={() => onStatusFilterChange(filter.value)}
              className={cn(
                'min-h-9 cursor-pointer rounded-full px-4 py-1.5 text-xs font-bold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
