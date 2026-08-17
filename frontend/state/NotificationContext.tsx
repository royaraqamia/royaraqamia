'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { useSession } from '@/frontend/state/session-provider';
import type { Notification, NotificationWithMeta } from '@/shared/contracts/notifications';
import { calculateTimeAgo } from '@/frontend/shared/format';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  subscribeToNotificationChanges,
} from '@/frontend/api/notifications';

interface NotificationContextType {
  notifications: NotificationWithMeta[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<NotificationWithMeta[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    try {
      const [data, count] = await Promise.all([getNotifications(), getUnreadCount()]);
      if (controller.signal.aborted) return;
      const withMeta = data.map((n: Notification) => ({
        ...n,
        timeAgo: calculateTimeAgo(n.created_at),
      }));
      setNotifications(withMeta);
      setUnreadCount(count);
    } catch {
      if (!controller.signal.aborted) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  useEffect(() => {
    if (!user) return;

    return subscribeToNotificationChanges(user.id, {
      onInsert: async (payload) => {
        const newNotif = payload.new as Notification;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === newNotif.id)) return prev;
          return [{ ...newNotif, timeAgo: calculateTimeAgo(newNotif.created_at) }, ...prev];
        });
        setUnreadCount((prev) => prev + 1);
        const { toast } = await import('sonner');
        toast(newNotif.title, {
          description: newNotif.body ?? undefined,
        });
      },
      onUpdate: (payload) => {
        const updated = payload.new as Notification;
        const prevItem = notificationsRef.current.find((n) => n.id === updated.id);
        const wasUnreadLocally = !!prevItem && !prevItem.is_read;
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === updated.id ? { ...updated, timeAgo: calculateTimeAgo(updated.created_at) } : n
          )
        );
        if (updated.is_read && wasUnreadLocally) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        } else if (!updated.is_read && prevItem?.is_read) {
          setUnreadCount((prev) => prev + 1);
        }
      },
      onDelete: (payload) => {
        const deletedId = (payload.old as Record<string, unknown>).id as string;
        setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
        setUnreadCount((prev) => {
          const target = notificationsRef.current.find((n) => n.id === deletedId);
          return target && !target.is_read ? Math.max(0, prev - 1) : prev;
        });
      },
    });
  }, [user]);

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await markAsRead(id);
      } catch {
        fetchData();
      }
    },
    [fetchData]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    const snapshot = notificationsRef.current;
    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
        read_at: n.read_at ?? new Date().toISOString(),
      }))
    );
    setUnreadCount(0);
    try {
      await markAllAsRead();
    } catch {
      setNotifications(snapshot);
      setUnreadCount(snapshot.filter((n) => !n.is_read).length);
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const snapshot = notificationsRef.current;
      const target = snapshot.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
      try {
        await deleteNotification(id);
      } catch {
        fetchData();
      }
    },
    [fetchData]
  );

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      isLoading,
      markAsRead: handleMarkAsRead,
      markAllAsRead: handleMarkAllAsRead,
      deleteNotification: handleDelete,
      refresh: fetchData,
    }),
    [
      notifications,
      unreadCount,
      isLoading,
      handleMarkAsRead,
      handleMarkAllAsRead,
      handleDelete,
      fetchData,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
