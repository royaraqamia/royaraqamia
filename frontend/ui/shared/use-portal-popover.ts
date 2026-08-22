'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

const MOBILE_BREAKPOINT = 640;
const MOBILE_TOP = 64;
const MOBILE_SIDE = 16;
const EDGE_PADDING = 8;
const VERTICAL_OFFSET = 10;

interface UsePortalPopoverOptions {
  width?: number;
  maxHeight?: boolean;
}

function stylesEqual(a: CSSProperties, b: CSSProperties): boolean {
  if (a === b) return true;
  const aKeys = Object.keys(a) as Array<keyof CSSProperties>;
  const bKeys = Object.keys(b) as Array<keyof CSSProperties>;
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

export function usePortalPopover(
  isOpen: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  { width = 320, maxHeight = true }: UsePortalPopoverOptions = {}
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const styleRef = useRef<CSSProperties>({});

  const position = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < MOBILE_BREAKPOINT;

    let next: CSSProperties;
    if (isMobile) {
      next = {
        position: 'fixed',
        top: MOBILE_TOP,
        left: MOBILE_SIDE,
        right: MOBILE_SIDE,
        width: 'auto',
        maxHeight: maxHeight ? `calc(100vh - ${MOBILE_TOP}px - ${MOBILE_SIDE * 2}px)` : undefined,
      };
    } else {
      const top = Math.min(rect.bottom + VERTICAL_OFFSET, viewportHeight - EDGE_PADDING);
      const left = Math.max(
        EDGE_PADDING,
        Math.min(rect.left, viewportWidth - width - EDGE_PADDING)
      );
      next = {
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: maxHeight ? `calc(100vh - ${top}px - ${EDGE_PADDING}px)` : undefined,
      };
    }

    if (!stylesEqual(styleRef.current, next)) {
      styleRef.current = next;
      setStyle(next);
    }
  }, [anchorRef, width, maxHeight]);

  useEffect(() => {
    if (!isOpen) return;

    let frameId: number | undefined;
    const schedulePosition = () => {
      if (frameId !== undefined) return;
      frameId = requestAnimationFrame(() => {
        frameId = undefined;
        position();
      });
    };

    position();
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition, { capture: true });
      if (frameId !== undefined) cancelAnimationFrame(frameId);
    };
  }, [isOpen, position]);

  return { panelRef, style };
}
