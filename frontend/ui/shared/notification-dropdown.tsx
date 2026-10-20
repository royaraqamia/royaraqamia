'use client';

import { useState, useRef, useEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  X,
  Check,
  Bell,
  BadgeCheck,
  SquarePen,
  CircleCheck,
  CalendarClock,
  CircleDollarSign,
  Link2,
  Megaphone,
  GraduationCap,
  CalendarCheck2,
} from 'lucide-react';
import { useNotifications } from '@/frontend/state/NotificationContext';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import { ScrollArea } from '@/frontend/ui/primitives/scroll-area';
import { ResponsiveSheetScrim } from '@/frontend/ui/primitives/responsive-sheet';
import { usePortalPopover } from './use-portal-popover';
import { SignInCta } from './sign-in-cta';
import { PushNotificationToggle } from './push-notification-toggle';

const typeIcons: Record<string, React.ReactNode> = {
  certificate_issued: <BadgeCheck size={18} />,
  post_published: <SquarePen size={18} />,
  habit_reminder: <CircleCheck size={18} />,
  recovery_nudge: <CalendarClock size={18} />,
  expense_alert: <CircleDollarSign size={18} />,
  link_clicked: <Link2 size={18} />,
  system_announcement: <Megaphone size={18} />,
  training_application: <GraduationCap size={18} />,
  consultation_booking: <CalendarCheck2 size={18} />,
};

const AUTH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/verify-otp',
  '/auth/reset-password',
  '/auth/update-password',
];

/** What the panel focuses first when it has no notification items to offer. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const NotificationDropdown = memo(function NotificationDropdown() {
  const { user } = useSession();
  const pathname = usePathname();
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  // Roving tabindex: exactly one menu item is in the tab order, and the arrow
  // keys move both focus and the tab stop (WAI-ARIA menu pattern).
  const [activeIndex, setActiveIndex] = useState(0);
  const menuId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { panelRef, style } = usePortalPopover(isOpen, ref, { width: 380, maxHeight: false });

  function getMenuItems(): HTMLElement[] {
    return Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  useEffect(() => {
    if (!isOpen) return;

    const panel = panelRef.current;
    if (!panel) return;

    setActiveIndex(0);
    // The panel is portaled outside the trigger's subtree, so focus has to be
    // moved in explicitly or every keydown stays on the trigger.
    const first =
      panel.querySelector<HTMLElement>('[role="menuitem"]') ??
      panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
  }, [isOpen, panelRef]);

  useEffect(() => {
    if (!isOpen) return;

    // Focus can still be on the trigger when the menu is open, and the panel is
    // portaled, so a document-level listener is the only reliable way to catch
    // `Escape` in both places.
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isInsideTrigger = ref.current?.contains(target);
      const isInsidePanel = panelRef.current?.contains(target);
      if (!isInsideTrigger && !isInsidePanel) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, panelRef]);

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const items = getMenuItems();
    if (items.length === 0) return;

    const currentIndex = items.indexOf(e.target as HTMLElement);
    let nextIndex: number;
    switch (e.key) {
      case 'ArrowDown':
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = items.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    items[nextIndex]?.focus();
    setActiveIndex(nextIndex);
  }

  function handleMenuBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    // Focus moving within the panel (or back to the trigger, which is a toggle)
    // is not a dismissal; anything else is, so `Tab` cannot leave a dangling
    // open panel behind.
    if (next && (panelRef.current?.contains(next) || ref.current?.contains(next))) return;
    setIsOpen(false);
  }

  // Guests see the bell too (consistent chrome); the panel nudges them to sign in.
  const loginHref =
    pathname && !AUTH_PATHS.some((p) => pathname.startsWith(p)) && pathname !== '/'
      ? `/auth/login?redirect=${encodeURIComponent(pathname)}`
      : '/auth/login';

  return (
    <div ref={ref} className="relative inline-block text-start">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative group flex items-center justify-center h-10 w-10 rounded-full border border-border/60 bg-background/80 text-foreground shadow-xs transition-safe duration-200 ease-out hover:border-primary/40 hover:bg-muted/80 hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isOpen && 'bg-muted border-primary/50 ring-2 ring-primary/20 shadow-sm scale-[1.02]'
        )}
        aria-label={`الإشعارات${unreadCount > 0 ? ` (${unreadCount} غير مقروء)` : ''}`}
        aria-haspopup="menu"
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
      >
        <Bell
          size={20}
          className="text-foreground/90 transition-transform duration-200 group-hover:scale-110"
        />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -inset-e-0.5 flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[10px] font-bold text-white bg-rose-500 rounded-full leading-none shadow-xs shadow-rose-500/40 ring-2 ring-background animate-in zoom-in-50">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <>
            <ResponsiveSheetScrim />
            <div
              ref={panelRef}
              id={menuId}
              data-glass-panel
              style={style}
              className={cn(
                'z-50 overflow-hidden will-change-[transform,opacity] contain-layout contain-style',
                'bg-popover border border-border/80 shadow-2xl rounded-2xl',
                'animate-in fade-in-0 zoom-in-95 duration-200 ease-out',
                'max-lg:z-[11000] max-lg:max-h-[85dvh] max-lg:rounded-b-none max-lg:rounded-t-3xl max-lg:border-x-0 max-lg:border-b-0 max-lg:slide-in-from-bottom-4'
              )}
              onKeyDown={handleMenuKeyDown}
              onBlur={handleMenuBlur}
              role="menu"
              aria-label="قائمة الإشعارات"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight text-foreground">الإشعارات</h3>
                  {unreadCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary">
                      {unreadCount} جديد
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-safe duration-150 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95"
                  >
                    <Check size={14} className="shrink-0" />
                    <span>تحديد الكل كمقروء</span>
                  </button>
                )}
              </div>

              {/* List Content */}
              {/* The scroll constraint must live on Radix's viewport (not just
                the overflow-hidden root) or tall lists get clipped instead of
                scrolled. */}
              <ScrollArea className="max-h-95 min-h-40 *:data-[slot=scroll-area-viewport]:max-h-95">
                {!user ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="p-3.5 rounded-full bg-muted/60 text-muted-foreground/80 mb-3 border border-border/40 shadow-inner">
                      <Bell size={24} />
                    </div>
                    <p className="text-sm font-bold text-foreground">
                      سجِّل الدُّخول لمتابعة إشعاراتك
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      تابع التَّنبيهات الخاصَّة بحسابك بعد تسجيل الدُّخول
                    </p>
                    <SignInCta href={loginHref} onClick={() => setIsOpen(false)} className="mt-4" />
                  </div>
                ) : isLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
                    <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="p-3.5 rounded-full bg-muted/60 text-muted-foreground/80 mb-3 border border-border/40 shadow-inner">
                      <Bell size={24} />
                    </div>
                    <p className="text-sm font-bold text-foreground">لا توجد إشعارات</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">
                      ستظهر هنا الإشعارات والتَّنبيهات الجديدة
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-border/40" role="none">
                    {notifications.map((notification, index) => (
                      <li
                        key={notification.id}
                        className={cn(
                          'px-4 py-3.5 transition-safe duration-200 ease-out relative group cursor-pointer select-none',
                          'focus-visible:bg-accent/80 focus-visible:outline-none',
                          !notification.is_read
                            ? 'bg-primary/4 dark:bg-primary/8 hover:bg-primary/8 dark:hover:bg-primary/[0.14]'
                            : 'hover:bg-muted/50'
                        )}
                        onClick={() => {
                          if (!notification.is_read) markAsRead(notification.id);
                        }}
                        role="menuitem"
                        tabIndex={
                          index === Math.min(activeIndex, notifications.length - 1) ? 0 : -1
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (!notification.is_read) markAsRead(notification.id);
                          }
                        }}
                      >
                        {/* Delete Action Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className={cn(
                            'absolute top-3 inset-inline-end-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                            'p-1.5 rounded-lg text-muted-foreground/70 hover:text-destructive hover:bg-destructive/10',
                            'transition-safe duration-150 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive'
                          )}
                          aria-label="حذف الإشعار"
                        >
                          <X size={14} />
                        </button>

                        <div className="flex items-start gap-3.5 pe-6">
                          {/* Icon Avatar */}
                          <div
                            className={cn(
                              'p-2.5 rounded-xl text-foreground shrink-0 transition-colors duration-200 flex items-center justify-center',
                              !notification.is_read
                                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                : 'bg-muted/80 text-muted-foreground group-hover:bg-muted group-hover:text-foreground'
                            )}
                          >
                            {typeIcons[notification.type] ?? <Bell size={18} />}
                          </div>

                          {/* Item Text Content */}
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={cn(
                                  'text-sm leading-snug tracking-tight',
                                  !notification.is_read
                                    ? 'font-bold text-foreground'
                                    : 'font-medium text-foreground/80'
                                )}
                              >
                                {notification.title}
                              </p>
                              {!notification.is_read && (
                                <span
                                  className="w-2 h-2 rounded-full bg-primary shrink-0 ring-4 ring-primary/20"
                                  role="status"
                                >
                                  <span className="sr-only">غير مقروء</span>
                                </span>
                              )}
                            </div>

                            {notification.body && (
                              <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed line-clamp-2 font-normal">
                                {notification.body}
                              </p>
                            )}

                            <p className="text-[11px] font-medium text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                              {notification.timeAgo}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>

              {/* Footer: OS-level push toggle (signed-in users only) */}
              {user && (
                <div className="border-t border-border/60">
                  <PushNotificationToggle />
                </div>
              )}
            </div>
          </>,
          document.body
        )}
    </div>
  );
});
