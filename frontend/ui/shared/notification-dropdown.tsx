'use client';

import { useState, useRef, useEffect } from 'react';
import {
  X,
  Check,
  Bell,
  Certificate,
  NotePencil,
  CheckCircle,
  CurrencyDollar,
  LinkSimple,
  Megaphone,
} from '@phosphor-icons/react';
import { useNotifications } from '@/frontend/state/NotificationContext';
import { cn } from '@/frontend/shared/cn';
import { ScrollArea } from '@/frontend/ui/ui/scroll-area';

const typeIcons: Record<string, React.ReactNode> = {
  certificate_issued: <Certificate size={18} />,
  post_published: <NotePencil size={18} />,
  habit_reminder: <CheckCircle size={18} />,
  expense_alert: <CurrencyDollar size={18} />,
  link_clicked: <LinkSimple size={18} />,
  system_announcement: <Megaphone size={18} />,
};

export function NotificationDropdown() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteNotification } =
    useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside, { passive: true });
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!items || items.length === 0) return;

      const currentIndex = Array.from(items).indexOf(
        e.currentTarget.ownerDocument.activeElement as HTMLElement
      );
      const nextIndex =
        e.key === 'ArrowDown'
          ? Math.min(currentIndex + 1, items.length - 1)
          : Math.max(currentIndex - 1, 0);
      items[nextIndex]?.focus();
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-full hover:bg-muted transition-colors',
          isOpen && 'bg-muted'
        )}
        aria-label={`الإشعارات${unreadCount > 0 ? ` (${unreadCount} غير مقروء)` : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Bell size={22} className="text-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-4.5 h-4.5 px-1 text-[11px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-2 w-52 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 sm:inset-s-0 max-sm:fixed max-sm:top-16 max-sm:inset-s-4 max-sm:w-[calc(100vw-2rem)]"
          onKeyDown={handleKeyDown}
          role="menu"
          aria-label="قائمة الإشعارات"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">الإشعارات</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllAsRead()}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Check size={14} />
                تحديد الكل كمقروء
              </button>
            )}
          </div>

          <ScrollArea className="max-h-80">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                جاري التحميل...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground gap-2">
                <Bell size={24} />
                لا توجد إشعارات
              </div>
            ) : (
              <ul ref={listRef} className="divide-y divide-border" role="listbox">
                {notifications.map((notification) => (
                  <li
                    key={notification.id}
                    className={cn(
                      'px-4 py-3 transition-colors hover:bg-muted/50 relative group cursor-pointer',
                      !notification.is_read && 'bg-primary/5'
                    )}
                    onClick={() => {
                      if (!notification.is_read) markAsRead(notification.id);
                    }}
                    role="menuitem"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!notification.is_read) markAsRead(notification.id);
                      }
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full hover:bg-muted"
                      aria-label="حذف الإشعار"
                    >
                      <X size={14} className="text-muted-foreground" />
                    </button>

                    <div className="flex items-start gap-3">
                      <span className="text-lg leading-none mt-0.5 text-primary">
                        {typeIcons[notification.type] ?? <Bell size={18} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            'text-sm leading-snug',
                            !notification.is_read && 'font-semibold'
                          )}
                        >
                          {notification.title}
                        </p>
                        {notification.body && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {notification.body}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground/60 mt-1">
                          {notification.timeAgo}
                        </p>
                      </div>
                      {!notification.is_read && (
                        <span
                          className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0"
                          role="status"
                        >
                          <span className="sr-only">غير مقروء</span>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
