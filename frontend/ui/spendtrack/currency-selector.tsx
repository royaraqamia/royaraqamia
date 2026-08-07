'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { setCurrency } from '@/frontend/api/spendtrack';
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  getCurrencyName,
  getCurrencySymbol,
  isSupportedCurrency,
} from '@/shared/currency';

export function CurrencySelector({ currency }: { currency?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const value = currency && isSupportedCurrency(currency) ? currency : DEFAULT_CURRENCY;

  async function handleChange(next: string) {
    if (next === value) return;
    setPending(true);
    const result = await setCurrency(next);
    setPending(false);
    if (result?.success) {
      toast.success('تمَّ تغيير العملة');
      router.refresh();
    } else {
      toast.error(result?.error ?? 'فشل تغيير العملة');
    }
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        aria-label="العملة"
        title={`العملة الحاليَّة: ${getCurrencyName(value)}`}
        className="group relative inline-flex h-10 w-full sm:w-auto min-w-37.5 max-w-60 items-center justify-between gap-2.5 rounded-xl border border-neutral-200/80 bg-white/80 px-3 py-2 text-xs sm:text-sm font-medium text-neutral-800 shadow-xs backdrop-blur-md transition-all duration-200 hover:border-neutral-300 hover:bg-neutral-50/90 hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 focus-visible:ring-offset-1 focus-visible:border-indigo-500 disabled:pointer-events-none disabled:opacity-60 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-800/80 dark:focus-visible:ring-indigo-400/20"
      >
        <SelectValue>
          <span className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-md border border-neutral-200/70 bg-neutral-100/80 px-1.5 text-[11px] font-bold text-neutral-700 tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors group-hover:border-neutral-300 group-hover:bg-neutral-200/50 dark:border-neutral-700/60 dark:bg-neutral-800 dark:text-neutral-300 dark:group-hover:border-neutral-600">
              {getCurrencySymbol(value)}
            </span>
            <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
              {getCurrencyName(value)}
            </span>
          </span>
        </SelectValue>
        {pending && (
          <span className="ms-auto flex items-center shrink-0">
            <svg
              className="h-3.5 w-3.5 animate-spin text-neutral-500 dark:text-neutral-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}
      </SelectTrigger>
      <SelectContent className="min-w-48 overflow-hidden rounded-xl border border-neutral-200/80 bg-white/95 p-1.5 text-neutral-900 shadow-xl backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/95 dark:text-neutral-100">
        {SUPPORTED_CURRENCIES.map((currencyItem) => (
          <SelectItem
            key={currencyItem.code}
            value={currencyItem.code}
            className="relative flex w-full cursor-pointer select-none items-center justify-between rounded-lg py-2 px-2.5 text-xs sm:text-sm font-medium outline-none transition-colors hover:bg-neutral-100/80 focus:bg-neutral-100 focus:text-neutral-900 dark:hover:bg-neutral-800/80 dark:focus:bg-neutral-800 dark:focus:text-neutral-100"
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-md border border-neutral-200/70 bg-neutral-100/90 px-1.5 text-[11px] font-bold text-neutral-800 tabular-nums dark:border-neutral-700/70 dark:bg-neutral-800 dark:text-neutral-200">
                {currencyItem.symbol}
              </span>
              <span className="truncate font-medium text-neutral-800 dark:text-neutral-200">
                {currencyItem.name}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
