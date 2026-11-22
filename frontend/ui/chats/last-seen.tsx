'use client';

import { useEffect, useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import { isOnline } from '@/frontend/shared/presence';
import type { LastSeenLabels } from './last-seen-labels';

/** Re-render the derived line so "online" ages into a timestamp on its own. */
const TICK_MS = 15_000;

const timeFormat = new Intl.DateTimeFormat('ar-u-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const dateFormat = new Intl.DateTimeFormat('ar-u-nu-latn', {
  day: 'numeric',
  month: 'long',
});

function isYesterday(date: Date, now: Date): boolean {
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  return (
    date.getFullYear() === previous.getFullYear() &&
    date.getMonth() === previous.getMonth() &&
    date.getDate() === previous.getDate()
  );
}

/** The exact-time line, in the header's words. `null` means "never seen". */
export function lastSeenLabel(
  labels: LastSeenLabels,
  lastSeenAt: string | null,
  now: number = Date.now()
): string | null {
  if (!lastSeenAt) return null;
  const seen = new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return null;

  const current = new Date(now);
  if (isOnline(lastSeenAt, now)) return labels.onlineNow;

  const time = timeFormat.format(seen);
  if (
    seen.getFullYear() === current.getFullYear() &&
    seen.getMonth() === current.getMonth() &&
    seen.getDate() === current.getDate()
  ) {
    return labels.lastSeenToday.replace('{time}', time);
  }
  if (isYesterday(seen, current)) {
    return labels.lastSeenYesterday.replace('{time}', time);
  }
  return labels.lastSeenOn.replace('{date}', dateFormat.format(seen)).replace('{time}', time);
}

/**
 * The line under a header's name: «متصل الآن» while the peer is here, then an
 * exact local time. نور has no peer row — it is always available, so its line
 * is a fact about the service rather than a stamp.
 */
export function LastSeenLine({
  labels,
  lastSeenAt,
  alwaysOnline = false,
  className,
}: {
  labels: LastSeenLabels;
  lastSeenAt?: string | null;
  alwaysOnline?: boolean;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (alwaysOnline || !lastSeenAt) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [alwaysOnline, lastSeenAt]);

  const label = alwaysOnline
    ? labels.assistantOnline
    : lastSeenLabel(labels, lastSeenAt ?? null, now);
  if (!label) return null;

  return (
    <span
      className={cn(
        'block truncate text-xs text-muted-foreground/70',
        (alwaysOnline || label === labels.onlineNow) && 'text-primary',
        className
      )}
    >
      {label}
    </span>
  );
}
