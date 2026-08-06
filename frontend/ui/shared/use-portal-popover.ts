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

export function usePortalPopover(
  isOpen: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  { width = 320, maxHeight = true }: UsePortalPopoverOptions = {}
) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  const position = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < MOBILE_BREAKPOINT;

    if (isMobile) {
      setStyle({
        position: 'fixed',
        top: MOBILE_TOP,
        left: MOBILE_SIDE,
        right: MOBILE_SIDE,
        width: 'auto',
        maxHeight: maxHeight ? `calc(100vh - ${MOBILE_TOP}px - ${MOBILE_SIDE * 2}px)` : undefined,
      });
      return;
    }

    const top = Math.min(rect.bottom + VERTICAL_OFFSET, viewportHeight - EDGE_PADDING);
    const left = Math.max(EDGE_PADDING, Math.min(rect.left, viewportWidth - width - EDGE_PADDING));
    setStyle({
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: maxHeight ? `calc(100vh - ${top}px - ${EDGE_PADDING}px)` : undefined,
    });
  }, [anchorRef, width, maxHeight]);

  useEffect(() => {
    if (!isOpen) return;

    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true, capture: true });
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, { capture: true });
    };
  }, [isOpen, position]);

  return { panelRef, style };
}
