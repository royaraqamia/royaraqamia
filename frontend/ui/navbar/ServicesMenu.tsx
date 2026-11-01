'use client';

import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';

import { scrollToSectionWithRetry } from '@/frontend/shared/scroll';
import { tolerateChunkFailure } from '../shared/lazy-chunk';

import { useVisibleServices } from './use-visible-services';

const loadServicesSheet = () => import('./ServicesSheet');

/**
 * The services sheet, off the initial graph — the home page keeps the bytes of
 * the sheet primitive for the interaction that opens it, not for the first
 * frame that only paints the button.
 */
const LazyServicesSheet = dynamic(
  tolerateChunkFailure('services sheet', () =>
    loadServicesSheet().then((m) => ({ default: m.ServicesSheet }))
  ),
  { ssr: false, loading: () => null }
);

/** The trigger contract the primitive's `Trigger` used to hand down. */
type TriggerProps = {
  id?: string;
  onClick?: () => void;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  'data-state'?: string;
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
};

interface ServicesMenuProps {
  /** The element that opens the menu; it becomes the sheet's trigger. */
  trigger: ReactNode;
}

/**
 * The services menu as a standalone trigger. Opens the same bottom `Sheet` as
 * the navbar menu, at every width — phone, tablet and desktop see one
 * presentation. Used by the hero CTA on the home page.
 *
 * The trigger stays a plain element (the caller's own button): importing the
 * primitive's trigger would pull the dialog runtime into the hero's first frame.
 * It receives the trigger's contract instead — `data-state`, `aria-expanded`,
 * `aria-controls` — so its open-state styles behave as they did.
 */
export function ServicesMenu({ trigger }: ServicesMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSheetMounted, setIsSheetMounted] = useState(false);
  const hasPrefetched = useRef(false);
  const triggerId = useId();
  const contentId = `${triggerId}-sheet`;
  // The hero's CTA opens the same rows the navbar does, minus the hidden ones
  // (ADR-0112). Hooks run before the empty return below.
  const { link, isEmpty } = useVisibleServices();

  const prefetchSheet = useCallback(() => {
    if (hasPrefetched.current) return;
    hasPrefetched.current = true;
    void loadServicesSheet().catch(() => {});
  }, []);

  const openSheet = useCallback(() => {
    setIsSheetMounted(true);
    setIsOpen(true);
  }, []);

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, hash: string) => {
    e.preventDefault();
    scrollToSectionWithRetry(hash.replace(/^\//, '').replace('#', ''));
  };

  // Every row is hidden: there is nothing to open, so the CTA goes with them.
  if (isEmpty) return null;

  const triggerElement = isValidElement(trigger) ? (trigger as ReactElement<TriggerProps>) : null;

  return (
    <>
      {triggerElement
        ? cloneElement(triggerElement, {
            id: triggerId,
            onClick: openSheet,
            onPointerEnter: prefetchSheet,
            onFocus: prefetchSheet,
            'data-state': isOpen ? 'open' : 'closed',
            'aria-expanded': isOpen,
            'aria-controls': isSheetMounted ? contentId : undefined,
          })
        : trigger}

      {isSheetMounted && (
        <LazyServicesSheet
          open={isOpen}
          onOpenChange={setIsOpen}
          link={link}
          handleHashClick={handleHashClick}
          triggerId={triggerId}
          contentId={contentId}
        />
      )}
    </>
  );
}
