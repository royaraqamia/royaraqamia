'use client';

import { memo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { useNotifications } from '@/frontend/state/NotificationContext';

import { NOTIFICATION_BELL_COPY } from './notification-bell-copy';

/**
 * The shell's notification control: a link to `/notifications`, never a panel.
 *
 * It used to open a dropdown at every width — a 380px popover the phone turned
 * into a bottom sheet, with its own roving-tabindex menu, focus trap and outside
 * -press handling. The notification centre is a page now, so the control is a
 * link, the count is the only state it holds, and the keyboard contract is the
 * browser's.
 */
export const NotificationBell = memo(function NotificationBell() {
  const pathname = usePathname();
  const { unreadCount } = useNotifications();
  const isCurrent = pathname === '/notifications';

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? NOTIFICATION_BELL_COPY.unread.replace('{count}', String(unreadCount))
          : NOTIFICATION_BELL_COPY.label
      }
      aria-current={isCurrent ? 'page' : undefined}
      className={cn(
        'relative group flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-xs transition-safe duration-200 ease-out',
        'hover:border-primary/40 hover:bg-muted/80 hover:scale-[1.03] active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isCurrent && 'border-primary/50 bg-muted ring-2 ring-primary/20'
      )}
    >
      <Bell
        size={20}
        className="text-foreground/90 transition-transform duration-200 group-hover:scale-110"
      />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -inset-e-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white shadow-xs shadow-rose-500/40 ring-2 ring-background animate-in zoom-in-50">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
});
