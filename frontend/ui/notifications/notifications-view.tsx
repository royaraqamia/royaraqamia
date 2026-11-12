'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BadgeCheck,
  Bell,
  CalendarCheck2,
  CalendarClock,
  Check,
  CircleCheck,
  CircleDollarSign,
  GraduationCap,
  Link2,
  Megaphone,
  MessagesSquare,
  UserPlus,
  X,
} from 'lucide-react';

import type { NotificationWithMeta } from '@/shared/contracts/notifications';
import { cn } from '@/frontend/shared/cn';
import { useNotifications } from '@/frontend/state/NotificationContext';
import { useChatThreads } from '@/frontend/state/chats/use-chat-threads';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useSession } from '@/frontend/state/session-provider';
import { ChatsPanel } from '@/frontend/ui/chats/chats-panel';
import { TabChips } from '@/frontend/ui/primitives/tab-chips';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { notificationTarget } from './notification-target';

const typeIcons: Record<string, React.ReactNode> = {
  certificate_issued: <BadgeCheck size={18} />,
  habit_reminder: <CircleCheck size={18} />,
  recovery_nudge: <CalendarClock size={18} />,
  expense_alert: <CircleDollarSign size={18} />,
  link_clicked: <Link2 size={18} />,
  system_announcement: <Megaphone size={18} />,
  training_application: <GraduationCap size={18} />,
  consultation_booking: <CalendarCheck2 size={18} />,
  chat_request: <MessagesSquare size={18} />,
  new_follower: <UserPlus size={18} />,
};

const TABS = [
  { id: 'chats', label: 'المحادثات' },
  { id: 'alerts', label: 'التَّنبيهات' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isTabId(value: string | null): value is TabId {
  return TABS.some((tab) => tab.id === value);
}

/**
 * The tab the page opens on when the URL does not name one: Alerts while
 * anything there is unread, Chats otherwise. The bell is the main door, and the
 * owner's rule is that an alert waiting to be read outranks the conversation
 * list; a member with neither still lands on Chats.
 *
 * Every notification type the product writes lands in Alerts — no producer
 * writes a chat row yet — so "anything unread" is the feed's own read state.
 */
function defaultTab(notifications: NotificationWithMeta[]): TabId {
  return notifications.some((notification) => !notification.is_read) ? 'alerts' : 'chats';
}

export function NotificationsView() {
  const { user } = useSession();
  const { identity } = useLocalIdentity();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();
  // The badge reads the same device-first list the tab draws (#1033).
  const chats = useChatThreads(Boolean(user), identity);

  const baseId = useId();
  const [chosen, setChosen] = useState<TabId | null>(null);

  const requested = searchParams.get('tab');
  const requestedTab = isTabId(requested) ? requested : null;
  const settled = !isLoading;
  // Until the feed answers, the page cannot tell Alerts from Chats, so it paints
  // the frame and a loading panel instead of a tab that is about to change.
  const activeTab: TabId | null =
    requestedTab ?? chosen ?? (settled ? defaultTab(notifications) : null);

  // The bare `/notifications` is not an address of its own (ADR-0156): once the
  // feed has answered, the address names the tab on screen, so a reload, a
  // bookmark or Back lands on the same list. The bell still links to the bare
  // path, and `defaultTab` decides what is waiting there.
  useEffect(() => {
    if (!settled || requestedTab || !activeTab) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', activeTab);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [settled, requestedTab, activeTab, pathname, router, searchParams]);

  /**
   * The badge on each tab. Alerts carries the server's unread count rather than a
   * count of the rows on screen: the feed is the newest 20, and a badge that
   * shrinks because older rows fell off the list would disagree with the bell.
   * Chats is the sum of its threads' unread messages, from the same read that
   * paints the list.
   */
  const unreadByTab = useMemo<Record<TabId, number>>(
    () => ({ chats: chats.unreadCount, alerts: unreadCount }),
    [chats.unreadCount, unreadCount]
  );

  const selectTab = useCallback(
    (next: TabId) => {
      setChosen(next);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', next);
      // Replace, not push: Back leaves the page instead of walking the tabs.
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  // Guests see the page too — the bell is chrome, not a member-only control — and
  // it returns them to the tab they were reading after signing in.
  const returnTo = requestedTab ? `${pathname}?tab=${requestedTab}` : pathname;
  const loginHref = `/auth/login?redirect=${encodeURIComponent(returnTo)}`;

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      {user && unreadCount > 0 && (
        <div className="mb-3 flex items-center justify-end">
          <button
            type="button"
            onClick={() => markAllAsRead()}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-primary transition-safe duration-150 hover:bg-primary/10 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
          >
            <Check size={14} className="shrink-0" />
            <span>تحديد الكل كمقروء</span>
          </button>
        </div>
      )}

      {activeTab === null ? (
        <div className="h-10 w-full animate-pulse rounded-full bg-muted/60 sm:w-72" />
      ) : (
        <TabChips
          label="أقسام الإشعارات"
          items={TABS.map((tab) => ({
            id: tab.id,
            label: tab.label,
            badge:
              unreadByTab[tab.id] > 99
                ? '99+'
                : unreadByTab[tab.id] > 0
                  ? unreadByTab[tab.id]
                  : undefined,
          }))}
          activeId={activeTab}
          onSelect={(id) => selectTab(id as TabId)}
          idPrefix={baseId}
          panelId={`${baseId}-panel`}
        />
      )}

      <section
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={activeTab ? `${baseId}-tab-${activeTab}` : undefined}
        className="mt-4"
      >
        {!user ? (
          <PanelState icon={<Bell size={24} />}>
            <p className="text-sm font-bold text-foreground">سجِّل الدُّخول لمتابعة إشعاراتك</p>
            <SignInCta href={loginHref} className="mt-4" />
          </PanelState>
        ) : isLoading ? (
          <PanelState>
            <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
          </PanelState>
        ) : activeTab === 'chats' ? (
          <ChatsPanel />
        ) : notifications.length === 0 ? (
          <PanelState icon={<Bell size={24} />}>
            <p className="text-sm font-bold text-foreground">لا توجد إشعارات</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              ستظهر هنا الإشعارات والتَّنبيهات الجديدة
            </p>
          </PanelState>
        ) : (
          <ul className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={markAsRead}
                onDelete={deleteNotification}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

interface PanelStateProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
}

/** The page's one empty/loading frame, so every state has the same rhythm. */
function PanelState({ children, icon }: PanelStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
      {icon && (
        <div className="mb-3 rounded-full border border-border/40 bg-muted/60 p-3.5 text-muted-foreground/80 shadow-inner">
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

interface NotificationRowProps {
  notification: NotificationWithMeta;
  onMarkRead: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function NotificationRow({ notification, onMarkRead, onDelete }: NotificationRowProps) {
  const target = notificationTarget(notification);
  const read = notification.is_read;

  const open = () => {
    if (!read) void onMarkRead(notification.id);
  };

  const body = (
    <div className="flex items-start gap-3.5 pe-8">
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-xl p-2.5 transition-colors duration-200',
          read
            ? 'bg-muted/80 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
            : 'bg-primary/10 text-primary ring-1 ring-primary/20'
        )}
      >
        {typeIcons[notification.type] ?? <Bell size={18} />}
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'text-sm leading-snug tracking-tight',
              read ? 'font-medium text-foreground/80' : 'font-bold text-foreground'
            )}
          >
            {notification.title}
          </p>
          {!read && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-primary ring-4 ring-primary/20"
              role="status"
            >
              <span className="sr-only">غير مقروء</span>
            </span>
          )}
        </div>

        {notification.body && (
          <p className="mt-1 line-clamp-2 text-xs font-normal leading-relaxed text-muted-foreground/80">
            {notification.body}
          </p>
        )}

        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground/60">
          {notification.timeAgo}
        </p>
      </div>
    </div>
  );

  return (
    <li
      className={cn(
        'group relative transition-safe duration-200 ease-out',
        'focus-within:bg-accent/60',
        read
          ? 'hover:bg-muted/50'
          : 'bg-primary/4 hover:bg-primary/8 dark:bg-primary/8 dark:hover:bg-primary/[0.14]'
      )}
    >
      {target ? (
        <Link
          href={target}
          onClick={open}
          className="block px-4 py-3.5 focus-visible:bg-accent/80 focus-visible:outline-none"
        >
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={open}
          className="block w-full px-4 py-3.5 text-start focus-visible:bg-accent/80 focus-visible:outline-none"
        >
          {body}
        </button>
      )}

      {/* A sibling of the row's link, never a child: a button inside an anchor is
          invalid, and the delete has to stay reachable without opening the row. */}
      <button
        type="button"
        onClick={() => void onDelete(notification.id)}
        aria-label="حذف الإشعار"
        className={cn(
          'absolute top-3 end-3 rounded-lg p-1.5 text-muted-foreground/70 transition-safe duration-150',
          'hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive',
          'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100'
        )}
      >
        <X size={14} />
      </button>
    </li>
  );
}
