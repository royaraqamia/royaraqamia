'use client';

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { useSession } from '@/frontend/state/session-provider';
import type { Notification, NotificationWithMeta } from '@/shared/contracts/notifications';
import { calculateTimeAgo } from '@/frontend/shared/format';
import {
  getNotificationSummary,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  subscribeToNotificationChanges,
} from '@/frontend/api/notifications';
import {
  notificationInitialState,
  notificationReducer,
} from '@/frontend/state/NotificationContext.reducer';

interface NotificationContextType {
  notifications: NotificationWithMeta[];
  unreadCount: number;
  isLoading: boolean;
  /** The read failed: an unreachable server is not "you have no notifications". */
  failed: boolean;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [state, dispatch] = useReducer(notificationReducer, undefined, notificationInitialState);
  const abortRef = useRef<AbortController | null>(null);
  // The feed a failed mark-all restores. Kept at the latest committed value,
  // as the handler's identity does not change with the feed.
  const latest = useRef(state);
  latest.current = state;

  const fetchData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!user) {
      dispatch({ type: 'cleared' });
      return;
    }

    try {
      const { notifications: data, count } = await getNotificationSummary();
      if (controller.signal.aborted) return;
      const withMeta = data.map((n: Notification) => ({
        ...n,
        timeAgo: calculateTimeAgo(n.created_at),
      }));
      dispatch({ type: 'loaded', notifications: withMeta, unreadCount: count });
    } catch {
      if (!controller.signal.aborted) dispatch({ type: 'failed' });
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
        dispatch({
          type: 'inserted',
          notification: { ...newNotif, timeAgo: calculateTimeAgo(newNotif.created_at) },
        });
        const { toast } = await import('sonner');
        toast(newNotif.title, {
          description: newNotif.body ?? undefined,
        });
      },
      onUpdate: (payload) => {
        const updated = payload.new as Notification;
        dispatch({
          type: 'updated',
          notification: { ...updated, timeAgo: calculateTimeAgo(updated.created_at) },
        });
      },
      onDelete: (payload) => {
        const deletedId = (payload.old as Record<string, unknown>).id as string;
        dispatch({ type: 'deleted', id: deletedId });
      },
    });
  }, [user]);

  const handleMarkAsRead = useCallback(
    async (id: string) => {
      dispatch({ type: 'markedRead', id, readAt: new Date().toISOString() });
      try {
        await markAsRead(id);
      } catch {
        fetchData();
      }
    },
    [fetchData]
  );

  const handleMarkAllAsRead = useCallback(async () => {
    const snapshot = latest.current.notifications;
    dispatch({ type: 'allMarkedRead', readAt: new Date().toISOString() });
    try {
      await markAllAsRead();
    } catch {
      dispatch({ type: 'restored', notifications: snapshot });
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      dispatch({ type: 'deleted', id });
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
      notifications: state.notifications,
      unreadCount: state.unreadCount,
      isLoading: state.isLoading,
      failed: state.failed,
      markAsRead: handleMarkAsRead,
      markAllAsRead: handleMarkAllAsRead,
      deleteNotification: handleDelete,
      refresh: fetchData,
    }),
    [state, handleMarkAsRead, handleMarkAllAsRead, handleDelete, fetchData]
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
