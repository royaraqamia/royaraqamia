'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { fetchPostEngagement, setPostLike } from '@/frontend/api/community-engagement';

/**
 * One post's engagement, as the controls draw it.
 *
 * `undefined` means "not answered yet", which is different from zero: the icon
 * shows without a number until the page's one batched read lands, rather than
 * flashing a zero that later becomes twelve.
 */
export interface EngagementEntry {
  likeCount: number;
  commentCount: number;
  liked: boolean;
}

interface PostEngagementContextValue {
  /** Subscribe to one post's numbers, not to the whole page's batch. */
  subscribe(postId: string, listener: () => void): () => void;
  get(postId: string): EngagementEntry | undefined;
  /** Ask for a post's numbers. Every card on a page joins one batch. */
  track(postId: string): void;
  /** Set the like wanted, optimistically, and settle on the server's count. */
  like(postId: string, slug: string, liked: boolean): Promise<void>;
  setCommentCount(postId: string, count: number): void;
}

const PostEngagementContext = createContext<PostEngagementContextValue | null>(null);

/** How long a page may keep registering cards before the batch is sent. */
const BATCH_DELAY_MS = 60;

/**
 * The page's engagement state (#1573).
 *
 * A feed is one request for its nine cards, not nine: every control registers
 * its post id and the provider flushes the set once. The same instance serves a
 * single post, so the like a reader presses on the card is already the state the
 * post page draws when it opens.
 *
 * It lives above both surfaces because the numbers are a property of the post,
 * not of the component that happens to be mounted.
 */
export function PostEngagementProvider({ children }: { children: ReactNode }) {
  // An external store lets one card re-render when its own numbers land instead
  // of every card when the page's 60ms batch arrives.
  const entries = useRef<Record<string, EngagementEntry>>({});
  const listeners = useRef(new Map<string, Set<() => void>>());

  const apply = useCallback((next: Record<string, EngagementEntry>) => {
    const previous = entries.current;
    entries.current = next;
    for (const [id, listenerSet] of listeners.current) {
      const before = previous[id];
      const after = next[id];
      if (
        before === after ||
        (before &&
          after &&
          before.likeCount === after.likeCount &&
          before.commentCount === after.commentCount &&
          before.liked === after.liked)
      ) {
        continue;
      }
      for (const listener of listenerSet) listener();
    }
  }, []);

  const subscribe = useCallback((postId: string, listener: () => void) => {
    const set = listeners.current.get(postId) ?? new Set<() => void>();
    set.add(listener);
    listeners.current.set(postId, set);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.current.delete(postId);
    };
  }, []);

  const get = useCallback((postId: string) => entries.current[postId], []);

  const tracked = useRef(new Set<string>());
  const queue = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const flush = useCallback(async () => {
    timer.current = null;
    const ids = [...queue.current];
    queue.current.clear();
    if (ids.length === 0) return;

    try {
      const items = await fetchPostEngagement(ids);
      if (!mounted.current) return;

      const next = { ...entries.current };
      for (const item of items) {
        next[item.postId] = {
          likeCount: item.likeCount,
          commentCount: item.commentCount,
          liked: item.liked,
        };
      }
      apply(next);
    } catch {
      // The read is an enhancement: a card whose numbers did not arrive draws
      // its controls without them, and a retry is the next page load. Nothing a
      // reader did is lost, so this is not a toast.
      for (const id of ids) tracked.current.delete(id);
    }
  }, [apply]);

  const track = useCallback(
    (postId: string) => {
      if (tracked.current.has(postId)) return;
      tracked.current.add(postId);
      queue.current.add(postId);

      if (timer.current === null) {
        timer.current = setTimeout(() => void flush(), BATCH_DELAY_MS);
      }
    },
    [flush]
  );

  const like = useCallback(
    async (postId: string, slug: string, liked: boolean) => {
      const previous = entries.current[postId];
      apply({
        ...entries.current,
        [postId]: {
          likeCount: Math.max(0, (previous?.likeCount ?? 0) + (liked ? 1 : -1)),
          commentCount: previous?.commentCount ?? 0,
          liked,
        },
      });

      try {
        const result = await setPostLike(slug, liked);
        if (!mounted.current) return;

        apply({
          ...entries.current,
          [postId]: {
            likeCount: result.likeCount,
            commentCount: entries.current[postId]?.commentCount ?? 0,
            liked: result.liked,
          },
        });
      } catch (error) {
        if (!mounted.current) return;

        const next = { ...entries.current };
        if (previous) next[postId] = previous;
        else delete next[postId];
        apply(next);
        toast.error(error instanceof Error ? error.message : 'تعذَّر تحديث الإعجاب.');
      }
    },
    [apply]
  );

  const setCommentCount = useCallback(
    (postId: string, count: number) => {
      apply({
        ...entries.current,
        [postId]: {
          likeCount: entries.current[postId]?.likeCount ?? 0,
          commentCount: count,
          liked: entries.current[postId]?.liked ?? false,
        },
      });
    },
    [apply]
  );

  // Stable for the life of the provider: a card subscribes to its own entry, so
  // a batch that changes one post does not re-render the other eight.
  const value = useMemo<PostEngagementContextValue>(
    () => ({ subscribe, get, track, like, setCommentCount }),
    [subscribe, get, track, like, setCommentCount]
  );

  return <PostEngagementContext.Provider value={value}>{children}</PostEngagementContext.Provider>;
}

/**
 * What a tree without the provider gets: controls that draw, and a press that
 * asks for a session it cannot complete.
 *
 * The provider is mounted once, in the root layout, so this is the seam for a
 * component rendered on its own — a story, a test, a future surface that has not
 * been wired yet. Throwing here would take the whole card down for a number it
 * can simply do without, which is the opposite of how the card already treats a
 * failed engagement read.
 */
const DETACHED: PostEngagementContextValue = {
  subscribe: () => () => {},
  get: () => undefined,
  track: () => {},
  like: async () => {},
  setCommentCount: () => {},
};

function useEngagementContext(): PostEngagementContextValue {
  return useContext(PostEngagementContext) ?? DETACHED;
}

/** One post's numbers, registered with the page's batch on mount. */
export function usePostEngagement(postId: string): EngagementEntry | undefined {
  const { subscribe, get, track } = useEngagementContext();

  useEffect(() => {
    track(postId);
  }, [track, postId]);

  const subscribeToPost = useCallback(
    (listener: () => void) => subscribe(postId, listener),
    [subscribe, postId]
  );
  const snapshot = useCallback(() => get(postId), [get, postId]);
  return useSyncExternalStore(subscribeToPost, snapshot, snapshot);
}

/** The like action, for a control that already knows its post. */
export function useLikePost(): (postId: string, slug: string, liked: boolean) => Promise<void> {
  return useEngagementContext().like;
}

/** Keeps the action bar's number honest when the thread writes a comment. */
export function useCommentCountSetter(): (postId: string, count: number) => void {
  return useEngagementContext().setCommentCount;
}
