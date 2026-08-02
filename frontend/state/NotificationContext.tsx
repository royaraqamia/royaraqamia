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
import { createClient } from '@/frontend/transport/supabase/client';
import { useSession } from '@/components/shared/session-provider';
import type { Notification, NotificationWithMeta } from '@/shared/contracts/notifications';
import { calculateTimeAgo } from '@/frontend/shared/format';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from '@/backend/actions/notifications';
import { toast } from 'sonner';

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

    const supabase = createClient();
    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const newNotif = payload.new as Notification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [{ ...newNotif, timeAgo: calculateTimeAgo(newNotif.created_at) }, ...prev];
          });
          setUnreadCount((prev) => prev + 1);
          toast(newNotif.title, {
            description: newNotif.body ?? undefined,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const updated = payload.new as Notification;
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === updated.id
                ? { ...updated, timeAgo: calculateTimeAgo(updated.created_at) }
                : n
            )
          );
          if (updated.is_read) {
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const deletedId = (payload.old as Record<string, unknown>).id as string;
          setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          setUnreadCount((prev) => {
            const target = notificationsRef.current.find((n) => n.id === deletedId);
            return target && !target.is_read ? Math.max(0, prev - 1) : prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
