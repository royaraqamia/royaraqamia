'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import type { HomeServiceKey } from '@/shared/contracts/home-services-catalog';

import { keyboardTarget, moveWithin, slotAtX, type TabRect } from './home-tab-order';

/** Movement past this before a press is a drag rather than a tap. */
const DRAG_SLOP_PX = 8;
/** How close to the scroller's edge the pill starts pulling the strip along. */
const EDGE_SCROLL_ZONE_PX = 48;
const EDGE_SCROLL_STEP_PX = 10;
/** A drag that ends must not also select the tab it ended on. */
const CLICK_SUPPRESS_MS = 400;

interface Grab {
  key: HomeServiceKey;
  /** The pill's list item; it is the element that floats under the pointer. */
  element: HTMLElement;
  pointerId: number;
  pointerX: number;
  startX: number;
  /** The pill's viewport left when it was picked up; layout ignores transforms. */
  startLeft: number;
  frame: number;
  moved: boolean;
}

export interface HomeTabOrder {
  /** What to draw: the member's order, or the draft while arranging. */
  order: readonly HomeServiceKey[];
  listRef: RefObject<HTMLUListElement | null>;
  arranging: boolean;
  dragging: HomeServiceKey | null;
  /** What just moved, for the strip's polite live region. */
  status: string;
  toggleArrange: () => void;
  closeArrange: () => void;
  getTabProps: (key: HomeServiceKey) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  };
}

interface UseHomeTabOrderOptions {
  order: readonly HomeServiceKey[];
  /** The horizontal scroller the strip lives in, for the drag's edge scroll. */
  scrollerRef: RefObject<HTMLElement | null>;
  onReorder: (next: readonly HomeServiceKey[]) => Promise<string | null>;
  describeMove: (key: HomeServiceKey, position: number, count: number) => string;
}

/**
 * The strip's arrange mode (ADR-0202): a draft order, the pointer drag that
 * rewrites it, and the keyboard path that does the same one slot at a time.
 *
 * The draft is local until a drop, so a drag crossing four slots is one write
 * rather than four. A drop and a keyboard move both hand the whole list to
 * `onReorder`, which is the only thing that knows whether the account or the
 * device is the store.
 *
 * The gesture is hand-rolled rather than a sortable dependency: the strip is in
 * the door's first paint, and the arithmetic is a handful of lines. While a pill
 * is loose it follows the pointer through its own `transform`, and the list
 * reorders underneath it as the pointer crosses a midpoint. The transform is
 * written straight to the node — a React render per frame of a list whose pills
 * are tabs is the one cost worth avoiding here.
 */
export function useHomeTabOrder({
  order,
  scrollerRef,
  onReorder,
  describeMove,
}: UseHomeTabOrderOptions): HomeTabOrder {
  const [arranging, setArranging] = useState(false);
  const [draft, setDraft] = useState<readonly HomeServiceKey[] | null>(null);
  const [dragging, setDragging] = useState<HomeServiceKey | null>(null);
  const [status, setStatus] = useState('');

  const listRef = useRef<HTMLUListElement | null>(null);
  const grabRef = useRef<Grab | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const suppressClickUntilRef = useRef(0);
  const orderRef = useRef(order);
  const draftRef = useRef<readonly HomeServiceKey[] | null>(null);

  orderRef.current = order;

  // A write that landed elsewhere — a refusal rolling back, another tab adding
  // an app — is the truth for the draft too, as long as no pill is in hand.
  useEffect(() => {
    if (!arranging) {
      draftRef.current = null;
      setDraft(null);
      return;
    }
    if (grabRef.current) return;

    draftRef.current = order;
    setDraft(order);
  }, [order, arranging]);

  const closeArrange = useCallback(() => {
    setArranging(false);
    setDraft(null);
    draftRef.current = null;
    setStatus('');
  }, []);

  const toggleArrange = useCallback(() => {
    if (arranging) {
      closeArrange();
      return;
    }

    draftRef.current = orderRef.current;
    setDraft(orderRef.current);
    setArranging(true);
    setStatus('');
  }, [arranging, closeArrange]);

  const finish = useCallback(() => {
    const grab = grabRef.current;
    if (!grab) return;

    grabRef.current = null;
    window.cancelAnimationFrame(grab.frame);
    grab.element.style.transform = '';
    detachRef.current?.();
    detachRef.current = null;
    setDragging(null);

    if (!grab.moved) return;

    const next = draftRef.current;
    if (!next) return;

    const position = next.indexOf(grab.key);
    if (position !== -1) setStatus(describeMove(grab.key, position + 1, next.length));
    void onReorder(next).then((message) => {
      if (message) setStatus(message);
    });
  }, [describeMove, onReorder]);

  /** One frame of the drag: follow the pointer, reorder, and scroll at the edges. */
  const settle = useCallback(
    (grab: Grab) => {
      if (grabRef.current !== grab || !grab.moved) return;

      const list = listRef.current;
      if (!list || !grab.element.isConnected) return;

      const listRect = list.getBoundingClientRect();
      // Layout positions ignore the transform, so the pill can float while the
      // list reorders beneath it without the two fighting each other.
      const flowLeft = listRect.left + grab.element.offsetLeft;
      const followLeft = grab.startLeft + (grab.pointerX - grab.startX);
      grab.element.style.transform = `translate3d(${Math.round(followLeft - flowLeft)}px, 0, 0)`;

      const pills = Array.from(list.querySelectorAll<HTMLElement>('[data-home-tab]'));
      const rects: TabRect[] = pills.map((pill) => ({
        left: listRect.left + pill.offsetLeft,
        width: pill.offsetWidth,
      }));

      const current = draftRef.current ?? orderRef.current;
      const from = current.indexOf(grab.key);
      const target = slotAtX(grab.pointerX, rects);
      if (from !== -1 && target !== from) {
        const next = moveWithin(current, from, target);
        draftRef.current = next;
        setDraft(next);
      }

      const scroller = scrollerRef.current;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (grab.pointerX < box.left + EDGE_SCROLL_ZONE_PX) {
          scroller.scrollBy({ left: -EDGE_SCROLL_STEP_PX });
        } else if (grab.pointerX > box.right - EDGE_SCROLL_ZONE_PX) {
          scroller.scrollBy({ left: EDGE_SCROLL_STEP_PX });
        }
      }
    },
    [scrollerRef]
  );

  const follow = useCallback(
    (grab: Grab) => {
      if (grabRef.current !== grab) return;
      settle(grab);
      grab.frame = window.requestAnimationFrame(() => follow(grab));
    },
    [settle]
  );

  const attach = useCallback(
    (grab: Grab) => {
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;

        grab.pointerX = event.clientX;
        if (!grab.moved && Math.abs(event.clientX - grab.startX) > DRAG_SLOP_PX) {
          grab.moved = true;
          suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
        }
        // A fast drag can end before the next frame: the slot is decided here,
        // and the frame loop only keeps the pill under a still pointer.
        if (grab.moved) settle(grab);
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;
        finish();
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    },
    [finish, settle]
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, key: HomeServiceKey) => {
      if (!arranging || grabRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const element = event.currentTarget;
      const grab: Grab = {
        key,
        element,
        pointerId: event.pointerId,
        pointerX: event.clientX,
        startX: event.clientX,
        startLeft: element.getBoundingClientRect().left,
        frame: 0,
        moved: false,
      };

      grabRef.current = grab;
      setDragging(key);
      setStatus('');
      attach(grab);
      follow(grab);
    },
    [arranging, attach, follow]
  );

  const getTabProps = useCallback(
    (key: HomeServiceKey) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startDrag(event, key),
      // The drag swallowed the tap, so the tab underneath must not select and
      // leave arrange mode on the pointerup that ended it.
      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
        if (Date.now() >= suppressClickUntilRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (!arranging) return;

        const current = draftRef.current ?? orderRef.current;
        const from = current.indexOf(key);
        if (from === -1) return;

        // The app is RTL, so the arrow that walks toward the end of the strip is
        // the left one; an explicit `dir` (and an LTR locale) keeps it honest.
        const direction =
          event.currentTarget.closest('[dir]')?.getAttribute('dir') ??
          document.documentElement.getAttribute('dir');
        const rtl = direction !== 'ltr';
        const to = keyboardTarget(from, event.key, current.length, rtl);
        if (to === null) return;

        event.preventDefault();
        const next = moveWithin(current, from, to);
        draftRef.current = next;
        setDraft(next);
        setStatus(describeMove(key, to + 1, next.length));
        void onReorder(next).then((message) => {
          if (message) setStatus(message);
        });
      },
    }),
    [arranging, describeMove, onReorder, startDrag]
  );

  useEffect(() => {
    return () => {
      const grab = grabRef.current;
      if (!grab) return;

      grabRef.current = null;
      window.cancelAnimationFrame(grab.frame);
      grab.element.style.transform = '';
      detachRef.current?.();
      detachRef.current = null;
    };
  }, []);

  return {
    order: arranging && draft ? draft : order,
    listRef,
    arranging,
    dragging,
    status,
    toggleArrange,
    closeArrange,
    getTabProps,
  };
}
