'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

import type { NavLink } from './NavDropdown';
import { SERVICES_ORDER_COPY } from './services-order-copy';
import {
  moveWithin,
  readServicesOrder,
  resolveServicesOrder,
  saveServicesOrder,
  slotAt,
  type RowRect,
} from './services-order';

/** How long a finger rests on a row before the row comes loose. */
const LONG_PRESS_MS = 350;
/** Movement past this before the press fires is a scroll, not a grab. */
const LONG_PRESS_SLOP_PX = 8;
/** How close to the sheet's edge the row starts pulling the list along. */
const EDGE_SCROLL_ZONE_PX = 56;
const EDGE_SCROLL_STEP_PX = 12;
/** A grab that began as a long press must not end as a tap on the link. */
const CLICK_SUPPRESS_MS = 400;

interface Grab {
  href: string;
  label: string;
  /** The row wrapper; it is the element that floats under the finger. */
  element: HTMLElement;
  pointerId: number;
  pointerY: number;
  startY: number;
  /** The row's viewport top at the moment it was grabbed. */
  startTop: number;
  scroller: HTMLElement | null;
  frame: number;
  longPress: boolean;
}

export interface ServicesOrder {
  orderedItems: NavLink[];
  listRef: RefObject<HTMLDivElement | null>;
  draggingHref: string | null;
  /** What just moved, for the sheet's polite live region. */
  status: string;
  getRowProps: (item: NavLink) => HTMLAttributes<HTMLDivElement> & { 'data-services-row': string };
  getHandleProps: (
    item: NavLink
  ) => ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string };
}

/**
 * The sentence a screen reader hears after a row moves, from the one copy source
 * both clients read (#806). Substituted here rather than formatted around, so
 * the word order stays in the source and not in two languages of string surgery.
 */
function announcement(label: string, position: number, total: number): string {
  return SERVICES_ORDER_COPY.moved
    .replace('{label}', label)
    .replace('{position}', String(position))
    .replace('{total}', String(total));
}

/** The nearest ancestor the pointer can actually scroll, which is the sheet. */
function scrollParent(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;

  while (node) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }

  return null;
}

/**
 * The `خدماتنا` sheet's order: what the device remembers, and the drag that
 * rewrites it.
 *
 * The gesture is hand-rolled rather than a dependency because it is one list
 * inside a sheet that already ships on the critical path — a sortable library
 * would add more bytes than this file. Three ways in, matching the three
 * pointers people actually use:
 *
 * - the grip, immediately, for mouse and touch;
 * - a long press on the row itself on touch, so the row does not need a target
 *   the size of a thumb;
 * - `↑`/`↓` (`Home`/`End`) on the focused grip, which is the only way a
 *   keyboard or switch user has.
 *
 * While a row is loose it follows the finger through its own `transform`, and
 * the list reorders underneath it as the pointer crosses a slot. The transform
 * is written straight to the node: a React re-render per frame of a dialog whose
 * rows are links is the one cost worth avoiding here.
 */
export function useServicesOrder(items: readonly NavLink[]): ServicesOrder {
  const defaultHrefs = useMemo(() => items.map((item) => item.href), [items]);

  const [order, setOrder] = useState<string[]>(() =>
    resolveServicesOrder(defaultHrefs, readServicesOrder())
  );
  const [draggingHref, setDraggingHref] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const listRef = useRef<HTMLDivElement | null>(null);
  const grabRef = useRef<Grab | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const pressRef = useRef<(() => void) | null>(null);
  const orderRef = useRef(order);
  const suppressClickUntilRef = useRef(0);

  const orderedItems = useMemo(() => {
    const byHref = new Map(items.map((item) => [item.href, item]));

    return resolveServicesOrder(defaultHrefs, order)
      .map((href) => byHref.get(href))
      .filter((item): item is NavLink => item !== undefined);
  }, [items, defaultHrefs, order]);

  /** State and the frame loop's synchronous copy move together, so a drop
   * persists the last swap even before React has committed it. */
  const applyOrder = useCallback((next: string[]) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const cancelPress = useCallback(() => {
    pressRef.current?.();
    pressRef.current = null;
  }, []);

  const finish = useCallback(() => {
    const grab = grabRef.current;
    if (!grab) return;

    grabRef.current = null;
    window.cancelAnimationFrame(grab.frame);
    grab.element.style.transform = '';
    detachRef.current?.();
    detachRef.current = null;
    setDraggingHref(null);

    const finalOrder = orderRef.current;
    saveServicesOrder(finalOrder);

    const position = finalOrder.indexOf(grab.href);
    if (position !== -1) {
      setStatus(announcement(grab.label, position + 1, finalOrder.length));
    }
  }, []);

  /** One frame of the drag: follow the finger, reorder, and scroll at the edges. */
  const paint = useCallback(
    (grab: Grab | null) => {
      if (!grab || grabRef.current !== grab) return;

      const list = listRef.current;
      if (!list || !grab.element.isConnected) return;

      const listTop = list.getBoundingClientRect().top;
      const rows = Array.from(list.querySelectorAll<HTMLElement>('[data-services-row]'));
      const hrefs = rows.map((row) => row.dataset.servicesRow ?? '');
      const rects: RowRect[] = rows.map((row) => ({
        top: listTop + row.offsetTop,
        height: row.offsetHeight,
      }));

      // Layout positions ignore the transform, so the row can float while the
      // list reorders beneath it without the two fighting each other.
      const flowTop = listTop + grab.element.offsetTop;
      const followTop = grab.startTop + (grab.pointerY - grab.startY);
      grab.element.style.transform = `translate3d(0, ${Math.round(followTop - flowTop)}px, 0)`;

      const from = hrefs.indexOf(grab.href);
      const target = slotAt(grab.pointerY, rects);
      if (from !== -1 && target !== from) {
        applyOrder(moveWithin(hrefs, from, target));
      }

      const scroller = grab.scroller;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        if (grab.pointerY < box.top + EDGE_SCROLL_ZONE_PX) {
          scroller.scrollTop -= EDGE_SCROLL_STEP_PX;
        } else if (grab.pointerY > box.bottom - EDGE_SCROLL_ZONE_PX) {
          scroller.scrollTop += EDGE_SCROLL_STEP_PX;
        }
      }

      grab.frame = window.requestAnimationFrame(() => paint(grab));
    },
    [applyOrder]
  );

  const attach = useCallback(
    (grab: Grab) => {
      const onMove = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;
        grab.pointerY = event.clientY;
      };
      const onUp = (event: PointerEvent) => {
        if (event.pointerId !== grab.pointerId) return;
        finish();
      };
      // A long press begins on the row, so the browser has already decided the
      // gesture may scroll. Cancelling here is what holds the sheet still while
      // the row moves; a grip does not need it (`touch-none` rules the gesture
      // out from its first event) but the listener is harmless there.
      const onTouchMove = (event: TouchEvent) => {
        if (grabRef.current !== grab) return;
        event.preventDefault();
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      window.addEventListener('touchmove', onTouchMove, { passive: false });

      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('touchmove', onTouchMove);
      };
    },
    [finish]
  );

  const startDrag = useCallback(
    (input: {
      href: string;
      label: string;
      element: HTMLElement;
      pointerId: number;
      pointerY: number;
      longPress: boolean;
    }) => {
      const list = listRef.current;
      if (!list || grabRef.current) return;

      cancelPress();

      const grab: Grab = {
        ...input,
        startY: input.pointerY,
        startTop: input.element.getBoundingClientRect().top,
        scroller: scrollParent(list),
        frame: 0,
      };

      grabRef.current = grab;
      if (input.longPress) suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;

      setDraggingHref(input.href);
      setStatus('');
      attach(grab);
      paint(grab);
    },
    [attach, cancelPress, paint]
  );

  /** Touch only: hold a row to pick it up, so a tap still follows the link. */
  const beginPress = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, href: string, label: string) => {
      if (event.pointerType === 'mouse' || event.button !== 0) return;
      cancelPress();

      const element = event.currentTarget;
      const { pointerId, clientX } = event;
      const startY = event.clientY;
      let pointerY = startY;
      let timer = 0;

      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        pointerY = moveEvent.clientY;
        const drift = Math.abs(moveEvent.clientY - startY) + Math.abs(moveEvent.clientX - clientX);
        if (drift > LONG_PRESS_SLOP_PX) cancelPress();
      };
      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId === pointerId) cancelPress();
      };

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);

      timer = window.setTimeout(() => {
        cancelPress();
        startDrag({ href, label, element, pointerId, pointerY, longPress: true });
      }, LONG_PRESS_MS);

      pressRef.current = cleanup;
    },
    [cancelPress, startDrag]
  );

  const getRowProps = useCallback(
    (item: NavLink) => ({
      'data-services-row': item.href,
      onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) =>
        beginPress(event, item.href, item.label),
      // The long press swallowed the tap, so the link underneath must not act
      // on the pointerup that ended the drag.
      onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (Date.now() >= suppressClickUntilRef.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [beginPress]
  );

  const getHandleProps = useCallback(
    (item: NavLink) => ({
      type: 'button' as const,
      'aria-label': `اسحب «${item.label}» لتغيير التَّرتيب`,
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();

        const element = event.currentTarget.closest<HTMLElement>('[data-services-row]');
        if (!element) return;

        startDrag({
          href: item.href,
          label: item.label,
          element,
          pointerId: event.pointerId,
          pointerY: event.clientY,
          longPress: false,
        });
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        const current = orderRef.current;
        const from = current.indexOf(item.href);
        if (from === -1) return;

        const to =
          event.key === 'ArrowUp'
            ? from - 1
            : event.key === 'ArrowDown'
              ? from + 1
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? current.length - 1
                  : from;

        if (to === from || to < 0 || to >= current.length) return;
        event.preventDefault();

        const next = moveWithin(current, from, to);
        applyOrder(next);
        saveServicesOrder(next);
        setStatus(announcement(item.label, to + 1, current.length));
      },
    }),
    [applyOrder, startDrag]
  );

  useEffect(() => {
    return () => {
      cancelPress();
      const grab = grabRef.current;
      if (!grab) return;

      grabRef.current = null;
      window.cancelAnimationFrame(grab.frame);
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [cancelPress]);

  return { orderedItems, listRef, draggingHref, status, getRowProps, getHandleProps };
}
