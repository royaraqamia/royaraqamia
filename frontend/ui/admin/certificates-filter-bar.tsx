'use client';

import { Search, Filter } from 'lucide-react';
import { Input } from '@/frontend/ui/ui/input';

export type StatusFilter = 'all' | 'valid' | 'expired';

interface CertificatesFilterBarProps {
  search: string;
  statusFilter: StatusFilter;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
}

export function CertificatesFilterBar({
  search,
  statusFilter,
  onSearchChange,
  onSearchSubmit,
  onStatusFilterChange,
}: CertificatesFilterBarProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
        className="relative flex-1 max-w-md"
      >
        <Search className="text-muted-foreground absolute top-1/2 inset-s-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="بحث بالاسم أو الرمز..."
          className="ps-10"
        />
      </form>
      <div className="flex items-center gap-2">
        <Filter className="text-muted-foreground size-4" />
        {(['all', 'valid', 'expired'] as StatusFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => onStatusFilterChange(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              statusFilter === f
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'الكل' : f === 'valid' ? 'صالحة' : 'منتهية'}
          </button>
        ))}
      </div>
    </div>
  );
}
