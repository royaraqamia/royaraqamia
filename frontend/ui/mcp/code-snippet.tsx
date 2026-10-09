'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';

import { logger } from '@/frontend/shared/logger';

type CopyState = 'idle' | 'copied' | 'error';

interface CodeSnippetProps {
  /** Raw text rendered in the block and written to the clipboard. */
  code: string;
  /** Optional caption shown above the block. */
  label?: string;
  /** Accessible name for the copy action, e.g. "نسخ عنوان الخادم". */
  copyLabel?: string;
}

const CONFIRM_MS = 2000;

/**
 * A dark code/URL block with a copy affordance. The button is always visible
 * (touch users get no hover), muted until hover/focus, and answers with an
 * inline icon swap — no toast, so the page keeps one feedback channel.
 */
export function CodeSnippet({ code, label, copyLabel = 'نسخ' }: CodeSnippetProps) {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = code.trim();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (error) {
      logger.error('MCP guide snippet copy failed', { error: String(error) });
      setState('error');
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState('idle'), CONFIRM_MS);
  }

  const status = state === 'copied' ? 'تم النسخ' : state === 'error' ? 'تعذر النسخ' : copyLabel;

  return (
    <div className="mt-4">
      {label && <p className="mb-1.5 text-xs font-bold text-muted-foreground">{label}</p>}
      <div className="relative" dir="ltr">
        <pre
          dir="ltr"
          lang="en"
          className="overflow-x-auto rounded-xl border border-border/70 bg-zinc-950 p-4 pe-14 text-left text-sm leading-relaxed text-zinc-100 font-mono dark:border-border/40"
        >
          <code>{text}</code>
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          title={status}
          aria-label={status}
          className="focus-ring touch-target-sm absolute end-2 top-2 z-10 flex items-center justify-center rounded-lg bg-zinc-950 text-zinc-400 transition-colors duration-150 ease-out hover:bg-zinc-800 hover:text-zinc-100 active:scale-95"
        >
          {state === 'copied' ? (
            <Check aria-hidden="true" className="size-4 text-emerald-400" />
          ) : state === 'error' ? (
            <TriangleAlert aria-hidden="true" className="size-4 text-rose-400" />
          ) : (
            <Copy aria-hidden="true" className="size-4" />
          )}
        </button>
        <span aria-live="polite" className="sr-only">
          {state === 'idle' ? '' : status}
        </span>
      </div>
    </div>
  );
}
