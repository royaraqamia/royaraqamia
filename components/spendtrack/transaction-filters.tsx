'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, X } from 'lucide-react';
import type { Category } from '@/domains/spendtrack/lib/database.types';

const datePresets = [
  { label: 'هذا الشهر', value: 'this_month' },
  { label: 'آخر 7 أيام', value: 'last_7' },
  { label: 'آخر 30 يوماً', value: 'last_30' },
  { label: 'الكل', value: 'all' },
] as const;

const sortOptions = [
  { label: 'الأحدث أولاً', value: 'date_desc' },
  { label: 'الأقدم أولاً', value: 'date_asc' },
  { label: 'الأعلى مبلغاً', value: 'amount_desc' },
  { label: 'الأقل مبلغاً', value: 'amount_asc' },
] as const;

export function TransactionFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = searchParams.get('range') || 'this_month';
  const currentSort = searchParams.get('sort') || 'date_desc';
  const customStart = searchParams.get('from') || '';
  const customEnd = searchParams.get('to') || '';
  const selectedCategories = searchParams.get('categories')
    ? searchParams.get('categories')!.split(',').filter(Boolean)
    : [];

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleCategory(catId: string) {
    const params = new URLSearchParams(searchParams.toString());
    const current = params.get('categories') || '';
    const cats = current ? current.split(',').filter(Boolean) : [];
    if (cats.includes(catId)) {
      const filtered = cats.filter((c) => c !== catId);
      if (filtered.length > 0) {
        params.set('categories', filtered.join(','));
      } else {
        params.delete('categories');
      }
    } else {
      cats.push(catId);
      params.set('categories', cats.join(','));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const selectedCount = selectedCategories.length;

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={currentRange} onValueChange={(v) => updateParam('range', v)}>
        <SelectTrigger className="w-full sm:w-[140px]" aria-label="نطاق التاريخ">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {datePresets.map((preset) => (
            <SelectItem key={preset.value} value={preset.value}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentRange === 'all' && (
        <>
          <Input
            type="date"
            className="w-full sm:w-[140px]"
            value={customStart}
            onChange={(e) => updateParam('from', e.target.value)}
            placeholder="من"
          />
          <Input
            type="date"
            className="w-full sm:w-[140px]"
            value={customEnd}
            onChange={(e) => updateParam('to', e.target.value)}
            placeholder="إلى"
          />
        </>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="justify-between w-full sm:w-[160px]"
            aria-label={`التصنيفات${selectedCount > 0 ? ` (${selectedCount} محددة)` : ''}`}
          >
            <span>{selectedCount > 0 ? `التصنيفات (${selectedCount})` : 'جميع التصنيفات'}</span>
            <ChevronDown className="size-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[220px] p-2" align="start">
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const isSelected = selectedCategories.includes(cat.id);
              return (
                <label
                  key={cat.id}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-accent cursor-pointer transition-colors duration-150"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input bg-background'
                    }`}
                  >
                    {isSelected && (
                      <svg className="size-2.5" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M10 3L4.5 8.5L2 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCategory(cat.id)}
                    className="sr-only"
                  />
                  <div
                    className="size-3 rounded-full shrink-0 ring-2 ring-border"
                    style={{ backgroundColor: cat.color_hex }}
                  />
                  {cat.name}
                </label>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Select value={currentSort} onValueChange={(v) => updateParam('sort', v)}>
        <SelectTrigger className="w-full sm:w-[160px]" aria-label="ترتيب المعاملات">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sortOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          className="gap-1.5"
          aria-label="مسح الفلاتر"
        >
          <X className="size-3.5" />
          مسح
          {selectedCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
              {selectedCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
