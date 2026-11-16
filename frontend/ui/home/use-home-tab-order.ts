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

/**
 * Movement past this before a touch press is a scroll rather than a lift.
 *
 * The strip scrolls on the same axis the drag travels, so there is no direction
 * that can tell the two apart: every home screen and every app that reorders a
 * horizontal shelf answers with a hold. A finger that moves first is scrolling;
 * a finger that stays put is picking a pill up.
 */
const TOUCH_SLOP_PX = 8;
/** A mouse has no native horizontal scroll to lose the gesture to. */
const MOUSE_SLOP_PX = 4;
/** How long the press must hold before the pill is in hand (platform convention). */
const LONG_PRESS_MS = 350;
/** How close to the scroller's edge the pill starts pulling the strip along. */
const EDGE_SCROLL_ZONE_PX = 64;
/** Edge scroll at the very edge of the zone, and at its inner boundary. */
const EDGE_SCROLL_FAST_PX = 14;
const EDGE_SCROLL_SLOW_PX = 2;
/** A drag that ends must not also select the tab it ended on. */
const CLICK_SUPPRESS_MS = 400;

interface Grab {
  key: HomeServiceKey;
  /** The pill's list item; it is the element that floats under the pointer. */
  element: HTMLElement;
  pointerId: number;
  pointerType: string;
  pointerX: number;
  startX: number;
  startY: number;
  /** The pill's viewport left when it came into hand; layout ignores transforms. */
  startLeft: number;
  /** The hold completed: the pill is in hand and follows the pointer. */
  armed: boolean;
  /** The last frame's inputs, so a still finger costs nothing. */
  lastX: number;
  lastScroll: number;
  /** The list reordered since the last frame: the transform must catch up. */
  dirty: boolean;
  holdTimer: number;
  frame: number;
  moved: boolean;
}

export interface HomeTabOrder {
  /** What to draw: the member's order, or the draft while arranging. */
  order: readonly HomeServiceKey[];
  listRef: RefObject<HTMLUListElement | null>;
  arranging: boolean;
  /** The pill in hand, or null. A press that is only a press is not a drag. */
  dragging: HomeServiceKey | null;
  /** What just moved, for the strip's polite live region. */
  status: string;
  toggleArrange: () => void;
  closeArrange: () => void;
  getTabProps: (key: HomeServiceKey) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
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
 * The strip's arrange mode (ADR-0202): a draft order, the drag that rewrites it,
 * and the keyboard path that does the same one slot at a time.
 *
 * The draft is local until a drop, so a drag crossing four slots is one write
 * rather than four. A drop and a keyboard move both hand the whole list to
 * `onReorder`, which is the only thing that knows whether the account or the
 * device is the store.
 *
 * **A pick-up needs a hold.** The first version armed the drag on `pointerdown`
 * and marked the whole strip `touch-none`, so on a phone the drag won every
 * gesture and the strip could not be scrolled — only the pills already on
 * screen were reachable. Now a finger that moves is scrolling (the browser
 * keeps the gesture), a finger that holds still for `LONG_PRESS_MS` lifts the
 * pill, and from that moment `touchmove` is prevented so the page stays put.
 * A mouse skips the hold: it has no scroll to be mistaken for.
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

  /** Drop the gesture without reordering: a scroll, a cancel, a closed mode. */
  const release = useCallback(
    (grab: Grab) => {
      if (grabRef.current !== grab) return;

      grabRef.current = null;
      window.clearTimeout(grab.holdTimer);
      window.cancelAnimationFrame(grab.frame);
      grab.element.style.transform = '';
      // The strip's list snaps to a pill; a pill in hand must not be yanked to
      // the nearest one on every frame of its edge scroll.
      scrollerRef.current?.style.removeProperty('scroll-snap-type');
      detachRef.current?.();
      detachRef.current = null;
      setDragging(null);
    },
    [scrollerRef]
  );

  /** One frame of the drag: follow the pointer, reorder, and scroll at the edges. */
  const settle = useCallback(
    (grab: Grab) => {
      if (grabRef.current !== grab || !grab.armed) return;

      const list = listRef.current;
      if (!list || !grab.element.isConnected) return;

      const scroller = scrollerRef.current;
      const scrollLeft = scroller?.scrollLeft ?? 0;

      // A still finger over a still strip has nothing new to decide. The strip
      // scrolling under it, or the list reordering, is a new decision.
      if (!grab.dirty && grab.pointerX === grab.lastX && scrollLeft === grab.lastScroll) return;
      grab.lastX = grab.pointerX;
      grab.lastScroll = scrollLeft;
      grab.dirty = false;

      // Every read happens before the write: a transform write followed by a
      // layout read forces a synchronous reflow on every frame of the drag.
      const listRect = list.getBoundingClientRect();
      const pills = Array.from(list.children) as HTMLElement[];
      const rects: TabRect[] = pills.map((pill) => ({
        left: listRect.left + pill.offsetLeft,
        width: pill.offsetWidth,
      }));
      // Layout positions ignore the transform, so the pill can float while the
      // list reorders beneath it without the two fighting each other.
      const flowLeft = listRect.left + grab.element.offsetLeft;
      const box = scroller?.getBoundingClientRect() ?? null;

      const current = draftRef.current ?? orderRef.current;
      const from = current.indexOf(grab.key);
      if (from !== -1) {
        const target = slotAtX(grab.pointerX, rects);
        if (target !== from) {
          const next = moveWithin(current, from, target);
          draftRef.current = next;
          setDraft(next);
          // The reordered list moves the pill in layout; the next frame pays
          // the transform back so it stays under the finger.
          grab.dirty = true;
        }
      }

      const followLeft = grab.startLeft + (grab.pointerX - grab.startX);
      grab.element.style.transform = `translate3d(${Math.round(followLeft - flowLeft)}px, 0, 0)`;

      if (!scroller || !box) return;

      // A pill held near an edge carries the strip with it, faster the deeper
      // the pointer is in the zone — without this a drag only reaches the pills
      // that already fit on screen.
      const intoLeft = grab.pointerX - box.left;
      const intoRight = box.right - grab.pointerX;
      if (intoLeft < EDGE_SCROLL_ZONE_PX) {
        scroller.scrollBy({ left: -edgeStep(intoLeft), behavior: 'instant' });
      } else if (intoRight < EDGE_SCROLL_ZONE_PX) {
        scroller.scrollBy({ left: edgeStep(intoRight), behavior: 'instant' });
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

  /** The hold completed: the pill is in hand from here on. */
  const arm = useCallback(
    (grab: Grab) => {
      if (grabRef.current !== grab || grab.armed) return;

      // The strip may have scrolled under the press (the arrows, an edge drag).
      // The pill's position and the pointer's are re-read together so the two
      // start from the same frame.
      grab.startLeft = grab.element.getBoundingClientRect().left;
      grab.startX = grab.pointerX;
      grab.armed = true;
      grab.dirty = true;
      // Free the strip from its snap points for as long as a pill is loose.
      const scroller = scrollerRef.current;
      if (scroller) scroller.style.scrollSnapType = 'none';
      suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
      setDragging(grab.key);
      setStatus('');
      if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
      follow(grab);
    },
    [follow, scrollerRef]
  );

  const finish = useCallback(() => {
    const grab = grabRef.current;
    if (!grab) return;

    const dropped = grab.armed && grab.moved;
    release(grab);
    if (!dropped) return;

    const next = draftRef.current;
    if (!next) return;

    const position = next.indexOf(grab.key);
    if (position !== -1) setStatus(describeMove(grab.key, position + 1, next.length));
    void onReorder(next).then((message) => {
      if (message) setStatus(message);
    });
  }, [describeMove, onReorder, release]);

  const attach = useCallback(
    (grab: Grab) => {
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;

        if (!grab.armed) {
          const travelled = Math.hypot(event.clientX - grab.startX, event.clientY - grab.startY);
          if (travelled <= (grab.pointerType === 'mouse' ? MOUSE_SLOP_PX : TOUCH_SLOP_PX)) return;

          // A finger that moves first is scrolling the strip. Let it go, and the
          // browser keeps the gesture it already owns.
          if (grab.pointerType !== 'mouse') {
            release(grab);
            return;
          }
          arm(grab);
        }

        grab.pointerX = event.clientX;
        grab.moved = true;
        // A fast drag can end before the next frame: the slot is decided here,
        // and the frame loop only keeps the pill under a still pointer.
        settle(grab);
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;
        finish();
      };
      const onCancel = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;
        release(grab);
      };
      // Registered non-passively on purpose: once the pill is in hand this is
      // what stops the browser from scrolling the strip out from under it.
      const onTouchMove = (event: TouchEvent) => {
        if (grabRef.current?.armed && event.cancelable) event.preventDefault();
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('touchmove', onTouchMove, { passive: false });

      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('touchmove', onTouchMove);
      };
    },
    [arm, finish, release, settle]
  );

  const startPress = useCallback(
    (event: ReactPointerEvent<HTMLElement>, key: HomeServiceKey) => {
      if (!arranging || grabRef.current) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;

      const element = event.currentTarget;
      const grab: Grab = {
        key,
        element,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        pointerX: event.clientX,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: element.getBoundingClientRect().left,
        armed: false,
        lastX: Number.NEGATIVE_INFINITY,
        lastScroll: Number.NEGATIVE_INFINITY,
        dirty: true,
        holdTimer: 0,
        frame: 0,
        moved: false,
      };

      grabRef.current = grab;
      attach(grab);

      // A mouse lifts on movement; a finger lifts on the hold, so a swipe still
      // belongs to the scroller.
      if (grab.pointerType === 'mouse') return;
      grab.holdTimer = window.setTimeout(() => arm(grab), LONG_PRESS_MS);
    },
    [arm, arranging, attach]
  );

  const closeArrange = useCallback(() => {
    const grab = grabRef.current;
    if (grab) release(grab);

    setArranging(false);
    setDraft(null);
    draftRef.current = null;
    setStatus('');
  }, [release]);

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

  const getTabProps = useCallback(
    (key: HomeServiceKey) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startPress(event, key),
      // The drag swallowed the tap, so the tab underneath must not select and
      // leave arrange mode on the pointerup that ended it.
      onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
        if (Date.now() >= suppressClickUntilRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
      // A held pill is being moved, not inspected: no text selection callout.
      onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
        if (arranging) event.preventDefault();
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (!arranging) return;

        // Escape drops a lifted pill where it was: nothing is saved.
        if (event.key === 'Escape' && grabRef.current) {
          event.preventDefault();
          release(grabRef.current);
          return;
        }

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
    [arranging, describeMove, onReorder, release, startPress]
  );

  useEffect(() => {
    return () => {
      const grab = grabRef.current;
      if (!grab) return;

      grabRef.current = null;
      window.clearTimeout(grab.holdTimer);
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

/**
 * How far one frame of edge scrolling travels, given how deep the pointer is in
 * the zone: a nudge at the inner boundary, a firm pull at the edge itself.
 */
function edgeStep(intoZone: number): number {
  const depth = Math.min(Math.max(1 - intoZone / EDGE_SCROLL_ZONE_PX, 0), 1);
  return Math.round(
    EDGE_SCROLL_SLOW_PX + depth * depth * (EDGE_SCROLL_FAST_PX - EDGE_SCROLL_SLOW_PX)
  );
}
