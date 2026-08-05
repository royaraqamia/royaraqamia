'use client';

import { type RefObject } from 'react';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { Hash, ScanLine, CheckCircle2, AlertCircle, Search } from 'lucide-react';
import { m } from 'motion/react';
import { cardVariants } from './verify-variants';

interface VerifySearchCardProps {
  code: string;
  isValidFormat: boolean | null;
  loading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onCodeChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onSampleClick: () => void;
}

export function VerifySearchCard({
  code,
  isValidFormat,
  loading,
  inputRef,
  onCodeChange,
  onSubmit,
  onSampleClick,
}: VerifySearchCardProps) {
  return (
    <m.div variants={cardVariants}>
      <Card className="relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-1 shadow-2xl shadow-indigo-500/5 backdrop-blur-xl transition-all duration-300 hover:border-border">
        <CardContent className="p-5 sm:p-8">
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-y-0 inset-s-0 flex items-center ps-4">
                <Hash
                  className={`size-5 transition-colors duration-200 ${code ? 'text-primary' : 'text-muted-foreground'}`}
                />
              </div>
              <Input
                ref={inputRef}
                type="text"
                value={code}
                onChange={(e) => onCodeChange(e.target.value.toUpperCase())}
                placeholder="COMP-2026-A1B2C3D4"
                className="h-13 w-full rounded-2xl border-border/70 bg-background/50 ps-11 pe-11 font-mono text-base tracking-wider uppercase shadow-xs backdrop-blur-sm transition-all duration-300 placeholder:font-sans placeholder:tracking-normal placeholder:normal-case focus:border-primary/60 focus:bg-background focus:ring-4 focus:ring-primary/10 dark:bg-neutral-900/60"
                maxLength={30}
                autoFocus
                required
                aria-label="رمز الشَّهادة"
              />
              {isValidFormat === true && (
                <div className="pointer-events-none absolute inset-y-0 inset-e-0 flex items-center pe-4">
                  <CheckCircle2 className="size-5 text-emerald-500 animate-in fade-in zoom-in-75 duration-200" />
                </div>
              )}
            </div>
            <Button
              type="submit"
              size="lg"
              isLoading={loading}
              disabled={loading || !code.trim()}
              className="h-13 min-h-13 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/3 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 sm:w-auto w-full gap-2 shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!loading && <Search className="size-5" />}
              <span>تحقُّق</span>
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4 text-xs text-muted-foreground">
            <button
              type="button"
              onClick={onSampleClick}
              className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <ScanLine className="size-3.5 text-primary/80 transition-transform group-hover:scale-110" />
              <span>مثال للتَّجربة:</span>
              <code className="font-mono font-semibold text-primary transition-underline group-hover:underline">
                COMP-2026-UHVW9SG5
              </code>
            </button>

            {isValidFormat === false && code.length >= 5 && (
              <m.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-1.5 font-medium text-destructive bg-destructive/10 px-3 py-1 rounded-lg border border-destructive/20 text-xs"
              >
                <AlertCircle className="size-3.5 shrink-0" />
                <span>الصِّيغة الصَّحيحة: COMP-YYYY-XXXXXXXX</span>
              </m.div>
            )}
          </div>
        </CardContent>
      </Card>
    </m.div>
  );
}
