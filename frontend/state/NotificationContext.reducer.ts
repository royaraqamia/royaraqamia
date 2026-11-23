import type { NotificationWithMeta } from '@/shared/contracts/notifications';

/**
 * The notification feed and the badge it drives. The read, the Realtime
 * handlers and the three optimistic actions all wrote the feed and the count
 * together — and several of those transitions read the rows they were about to
 * replace — so the pair is one state here and each transition is named.
 */
export interface NotificationState {
  notifications: NotificationWithMeta[];
  unreadCount: number;
  isLoading: boolean;
  failed: boolean;
}

export type NotificationAction =
  | { type: 'loaded'; notifications: NotificationWithMeta[]; unreadCount: number }
  | { type: 'cleared' }
  | { type: 'failed' }
  | { type: 'inserted'; notification: NotificationWithMeta }
  | { type: 'updated'; notification: NotificationWithMeta }
  | { type: 'deleted'; id: string }
  | { type: 'markedRead'; id: string; readAt: string }
  | { type: 'allMarkedRead'; readAt: string }
  | { type: 'restored'; notifications: NotificationWithMeta[] };

export function notificationInitialState(): NotificationState {
  return { notifications: [], unreadCount: 0, isLoading: true, failed: false };
}

function unreadIn(notifications: NotificationWithMeta[]): number {
  return notifications.filter((notification) => !notification.is_read).length;
}

export function notificationReducer(
  state: NotificationState,
  action: NotificationAction
): NotificationState {
  switch (action.type) {
    case 'loaded':
      return {
        notifications: action.notifications,
        unreadCount: action.unreadCount,
        isLoading: false,
        failed: false,
      };

    case 'cleared':
      return { notifications: [], unreadCount: 0, isLoading: false, failed: false };

    // An unreachable server is not "you have no notifications": the feed is
    // blank, but the flag says why.
    case 'failed':
      return { notifications: [], unreadCount: 0, isLoading: false, failed: true };

    case 'inserted':
      // The list skips a row it already holds, but the badge is bumped for every
      // insert event, exactly as the two setters did before.
      return {
        ...state,
        notifications: state.notifications.some(
          (notification) => notification.id === action.notification.id
        )
          ? state.notifications
          : [action.notification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      };

    case 'updated': {
      const previous = state.notifications.find(
        (notification) => notification.id === action.notification.id
      );
      const wasUnreadLocally = !!previous && !previous.is_read;
      const notifications = state.notifications.map((notification) =>
        notification.id === action.notification.id ? action.notification : notification
      );
      let unreadCount = state.unreadCount;
      if (action.notification.is_read && wasUnreadLocally) {
        unreadCount = Math.max(0, unreadCount - 1);
      } else if (!action.notification.is_read && previous?.is_read) {
        unreadCount = unreadCount + 1;
      }
      return { ...state, notifications, unreadCount };
    }

    case 'deleted': {
      const target = state.notifications.find((notification) => notification.id === action.id);
      return {
        ...state,
        notifications: state.notifications.filter((notification) => notification.id !== action.id),
        unreadCount:
          target && !target.is_read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }

    case 'markedRead':
      return {
        ...state,
        notifications: state.notifications.map((notification) =>
          notification.id === action.id
            ? { ...notification, is_read: true, read_at: action.readAt }
            : notification
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      };

    case 'allMarkedRead':
      return {
        ...state,
        notifications: state.notifications.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.read_at ?? action.readAt,
        })),
        unreadCount: 0,
      };

    // A failed mark-all restores the feed it optimistically replaced.
    case 'restored':
      return {
        ...state,
        notifications: action.notifications,
        unreadCount: unreadIn(action.notifications),
      };
  }
}
