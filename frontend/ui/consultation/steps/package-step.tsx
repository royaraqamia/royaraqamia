'use client';

import { CheckCircle, Clock, Layers } from 'lucide-react';
import type { ConsultationPackage } from '@/shared/contracts/consultation';
import { cn } from '@/frontend/shared/cn';

interface PackageStepProps {
  packages: ConsultationPackage[];
  selectedId: string | null;
  onSelect: (packageId: string) => void;
}

export function PackageStep({ packages, selectedId, onSelect }: PackageStepProps) {
  if (packages.length === 0) {
    return (
      <p className="text-center text-muted-foreground py-10">
        لا توجد باقات متاحة حاليًا، يرجى المحاولة لاحقًا.
      </p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label="اختر الباقة">
      {packages.map((pkg) => {
        const selected = pkg.id === selectedId;
        return (
          <button
            key={pkg.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(pkg.id)}
            className={cn(
              'text-right rounded-2xl border-2 p-5 transition-all duration-300 cursor-pointer',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-h-11',
              selected
                ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
            )}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="font-bold text-lg text-foreground">{pkg.name}</h3>
              <span
                className={cn(
                  'flex items-center justify-center size-6 rounded-full border-2 shrink-0 mt-1',
                  selected ? 'border-primary bg-primary' : 'border-border'
                )}
              >
                {selected && <CheckCircle className="size-4 text-primary-foreground" />}
              </span>
            </div>

            {pkg.description && (
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 line-clamp-3">
                {pkg.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-auto">
              <span className="text-2xl font-black bg-linear-to-l from-purple-500 to-indigo-400 bg-clip-text text-transparent">
                ${pkg.price_usd}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {pkg.duration_minutes} دقيقة للجلسة
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Layers className="size-3.5" />
                {pkg.sessions_count === 1 ? 'جلسة واحدة' : `${pkg.sessions_count} جلسات`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
