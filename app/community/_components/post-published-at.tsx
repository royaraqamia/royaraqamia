'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';

const calendar = 'islamic-umalqura' as const;
const numberingSystem = 'latn' as const;

/**
 * Formats the instant in the visitor's own timezone. Runs after mount on
 * purpose: the server (and its hydration pass) renders in the server's zone, so
 * formatting here once avoids a mismatched first paint while still reflecting
 * where the reader actually is.
 */
function formatLocal(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    date: new Intl.DateTimeFormat('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar,
      numberingSystem,
      timeZone,
    }).format(date),
    time: new Intl.DateTimeFormat('ar-SA', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      numberingSystem,
      timeZone,
    }).format(date),
  };
}

/** Publication date + time, shown in the visitor's local timezone. */
export function PostPublishedAt({ publishedAt }: { publishedAt: string }) {
  const [value, setValue] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    setValue(formatLocal(publishedAt));
  }, [publishedAt]);

  if (!value) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Calendar className="size-3.5 text-primary/70 shrink-0" aria-hidden="true" />
        <time dateTime={publishedAt}>{value.date}</time>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Clock className="size-3.5 text-primary/70 shrink-0" aria-hidden="true" />
        <span>{value.time}</span>
      </span>
    </span>
  );
}
