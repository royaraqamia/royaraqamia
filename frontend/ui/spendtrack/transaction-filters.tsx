'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/frontend/ui/primitives/popover';
import { DateRangePicker } from '@/frontend/ui/primitives/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { ChevronDown, X, Search, Calendar, Tag, ArrowUpDown, RotateCcw, Check } from 'lucide-react';
import type { Category } from '@/shared/contracts/spendtrack';

const datePresets = [
  { label: 'هذا الشَّهر', value: 'this_month' },
  { label: 'آخر 7 أيَّام', value: 'last_7' },
  { label: 'آخر 30 يومًا', value: 'last_30' },
  { label: 'الكل', value: 'all' },
] as const;

const sortOptions = [
  { label: 'الأحدث أوَّلًا', value: 'date_desc' },
  { label: 'الأقدم أوَّلًا', value: 'date_asc' },
  { label: 'الأعلى مبلغًا', value: 'amount_desc' },
  { label: 'الأقل مبلغًا', value: 'amount_asc' },
] as const;

export function TransactionFilters({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = searchParams.get('range') || 'this_month';
  const currentSort = searchParams.get('sort') || 'date_desc';
  const customStart = searchParams.get('from') || '';
  const customEnd = searchParams.get('to') || '';
  const searchTerm = searchParams.get('search') || '';
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
    <section className="w-full" aria-label="فلاتر المعاملات">
      <div className="w-full bg-card/70 backdrop-blur-xl border border-border/60 rounded-2xl p-2.5 sm:p-3.5 shadow-xs transition-all duration-300 hover:border-border/80">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3">
          {/* Search bar input */}
          <DebouncedSearch value={searchTerm} onChange={(v) => updateParam('search', v)} />

          {/* Action controls grid/flex */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 flex-1 lg:flex-initial">
            {/* Date preset selector */}
            <Select value={currentRange} onValueChange={(v) => updateParam('range', v)}>
              <SelectTrigger
                className="h-10 sm:h-11 w-full sm:w-auto min-w-32.5 flex-1 sm:flex-none px-3.5 bg-background/80 hover:bg-accent/40 border-border/60 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 shadow-xs flex items-center justify-between gap-2"
                aria-label="نطاق التَّاريخ"
              >
                <div className="flex items-center gap-2 truncate">
                  <Calendar className="size-4 text-muted-foreground shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/80 shadow-xl backdrop-blur-md bg-popover/95 p-1 animate-in fade-in-80 zoom-in-95">
                {datePresets.map((preset) => (
                  <SelectItem
                    key={preset.value}
                    value={preset.value}
                    className="rounded-lg text-xs sm:text-sm font-medium py-2 px-3 focus:bg-accent focus:text-accent-foreground cursor-pointer transition-colors"
                  >
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Custom date range picker if 'all' is selected */}
            {currentRange === 'all' && (
              <div className="w-full sm:w-auto flex-1 sm:flex-none transition-all duration-200">
                <DateRangePicker
                  from={customStart}
                  to={customEnd}
                  onChange={(from, to) => {
                    const params = new URLSearchParams(searchParams.toString());
                    if (from) params.set('from', from);
                    else params.delete('from');
                    if (to) params.set('to', to);
                    else params.delete('to');
                    router.push(`${pathname}?${params.toString()}`);
                  }}
                  className="w-full sm:w-60 h-10 sm:h-11 rounded-xl border-border/60 shadow-xs"
                  aria-label="الفترة الزَّمنيَّة"
                />
              </div>
            )}

            {/* Category selection popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`h-10 sm:h-11 px-3.5 w-full sm:w-auto min-w-35 flex-1 sm:flex-none justify-between rounded-xl border-border/60 hover:border-border text-xs sm:text-sm font-medium transition-all duration-200 shadow-xs active:scale-[0.98] ${
                    selectedCount > 0
                      ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/15'
                      : 'bg-background/80 hover:bg-accent/40 text-foreground'
                  }`}
                  aria-label={`التَّصنيفات${selectedCount > 0 ? ` (${selectedCount} مُحدَّدَة)` : ''}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Tag
                      className={`size-4 shrink-0 ${selectedCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}
                    />
                    <span>
                      {selectedCount > 0 ? `التَّصنيفات (${selectedCount})` : 'جميع التَّصنيفات'}
                    </span>
                  </span>
                  <ChevronDown className="size-4 opacity-50 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-64 p-2 rounded-2xl border-border/80 shadow-2xl backdrop-blur-xl bg-popover/95"
                align="start"
              >
                <div className="space-y-0.5 max-h-64 overflow-y-auto p-1 custom-scrollbar">
                  {categories.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <label
                        key={cat.id}
                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs sm:text-sm font-medium cursor-pointer transition-all duration-150 select-none ${
                          isSelected
                            ? 'bg-primary/10 text-primary hover:bg-primary/15'
                            : 'hover:bg-muted/70 text-foreground/80 hover:text-foreground'
                        }`}
                      >
                        <span
                          className={`flex size-4.5 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                            isSelected
                              ? 'bg-primary border-primary text-primary-foreground shadow-2xs scale-100'
                              : 'border-muted-foreground/30 bg-background hover:border-primary/50'
                          }`}
                        >
                          {isSelected && <Check className="size-3 stroke-3" />}
                        </span>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCategory(cat.id)}
                          className="sr-only"
                          aria-label={`تصنيف ${cat.name}`}
                        />
                        <div
                          className="size-2.5 rounded-full shrink-0 ring-2 ring-background shadow-2xs"
                          style={{ backgroundColor: cat.colorHex }}
                        />
                        <span className="truncate">{cat.name}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Sort order select */}
            <Select value={currentSort} onValueChange={(v) => updateParam('sort', v)}>
              <SelectTrigger
                className="h-10 sm:h-11 w-full sm:w-auto min-w-35 flex-1 sm:flex-none px-3.5 bg-background/80 hover:bg-accent/40 border-border/60 hover:border-border focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 shadow-xs flex items-center justify-between gap-2"
                aria-label="ترتيب المعاملات"
              >
                <div className="flex items-center gap-2 truncate">
                  <ArrowUpDown className="size-4 text-muted-foreground shrink-0" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border/80 shadow-xl backdrop-blur-md bg-popover/95 p-1 animate-in fade-in-80 zoom-in-95">
                {sortOptions.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="rounded-lg text-xs sm:text-sm font-medium py-2 px-3 focus:bg-accent focus:text-accent-foreground cursor-pointer transition-colors"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear all active filters */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(pathname)}
                className="h-10 sm:h-11 px-3.5 w-full sm:w-auto gap-1.5 rounded-xl text-xs sm:text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-200 shrink-0 active:scale-95"
                aria-label="مسح الفلاتر"
              >
                <RotateCcw className="size-3.5 transition-transform duration-300 hover:-rotate-90" />
                <span>مسح الفلاتر</span>
                {selectedCount > 0 && (
                  <span className="flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-2xs ms-0.5">
                    {selectedCount}
                  </span>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function DebouncedSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className="relative flex-1 min-w-50 lg:max-w-xs group">
      <Search
        className="absolute inset-s-3.5 top-1/2 size-4 -translate-y-1/2 pointer-events-none text-muted-foreground/60 transition-colors group-focus-within:text-primary"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={input}
        placeholder="ابحث في الوصف..."
        aria-label="البحث في المصروفات"
        className="w-full h-10 sm:h-11 ps-10 pe-9 bg-background/80 hover:bg-accent/40 focus:bg-background border-border/60 hover:border-border focus:border-primary/50 rounded-xl transition-all duration-200 text-xs sm:text-sm placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-0 focus-visible:outline-none shadow-xs"
        onChange={(e) => {
          const next = e.target.value;
          setInput(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onChange(next), 300);
        }}
      />
      {input && (
        <button
          type="button"
          onClick={() => {
            setInput('');
            if (timer.current) clearTimeout(timer.current);
            onChange('');
          }}
          className="absolute inset-e-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground hover:bg-muted/80 p-1 rounded-md transition-all active:scale-90"
          aria-label="مسح البحث"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
