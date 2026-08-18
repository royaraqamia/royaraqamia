'use client';

import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { HOME_SECTION_IDS, loadHomeSection, type HomeSectionId } from '../lazy-sections';

/**
 * Below-the-fold section that mounts its JS only when it nears the viewport.
 *
 * A server component renders this thin client island as an empty placeholder;
 * an IntersectionObserver (600px look-ahead) or an in-page `#anchor` click
 * triggers the dynamic `import()` of the real section. This keeps the motion/
 * icon-heavy section code out of the homepage's initial critical path.
 * If `IntersectionObserver` is unavailable (old engines, jsdom) it loads
 * immediately — same convention as `MotionReveal`.
 */
const PENDING = new Set<HomeSectionId>();
let anchorListenerAttached = false;

function preloadSection(id: HomeSectionId): Promise<ComponentType> {
  if (!PENDING.has(id)) PENDING.add(id);
  return loadHomeSection(id).catch((error) => {
    PENDING.delete(id);
    throw error;
  });
}

function attachAnchorPreload() {
  if (anchorListenerAttached) return;
  anchorListenerAttached = true;
  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!anchor) return;
    const id = anchor.getAttribute('href')?.slice(1);
    if (id && (HOME_SECTION_IDS as readonly string[]).includes(id)) {
      preloadSection(id as HomeSectionId);
    }
  });
}

export function LazySection({ id, className }: { id: HomeSectionId; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [Comp, setComp] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    attachAnchorPreload();

    if (window.location.hash === `#${id}`) {
      preloadSection(id);
    }

    let observer: IntersectionObserver | undefined;
    let cancelled = false;

    const mount = () => {
      if (cancelled) return;
      preloadSection(id)
        .then((Component) => {
          if (!cancelled) setComp(() => Component);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };

    if (typeof IntersectionObserver === 'undefined') {
      mount();
      return () => {
        cancelled = true;
      };
    }

    const el = ref.current;
    if (!el) {
      mount();
      return () => {
        cancelled = true;
      };
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer?.disconnect();
          mount();
        }
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(el);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [id]);

  if (Comp) return <Comp />;
  if (failed) return null;
  return <div ref={ref} className={className} aria-hidden="true" />;
}
