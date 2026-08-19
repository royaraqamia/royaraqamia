'use client';

import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { HOME_SECTION_IDS, loadHomeSection, type HomeSectionId } from '../lazy-sections';

/**
 * Below-the-fold section that mounts its JS only when it nears the viewport.
 *
 * A server component renders this thin client island as an empty placeholder
 * carrying the section `id` (so in-page `#anchor` links always resolve to a
 * scroll target); an IntersectionObserver (600px look-ahead) or an in-page
 * `#anchor` click triggers the dynamic `import()` of the real section. Clicking
 * such an anchor scrolls to the mounted section after the lazy mount settles,
 * so sections above it can't push the target out of view.
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
      event.preventDefault();
      preloadSection(id as HomeSectionId);
      scrollToLazySection(id);
    }
  });
}

/**
 * Scrolls to a lazy section, correcting for the layout shift caused by
 * sections above it mounting after the browser's native anchor navigation.
 *
 * The placeholder (with the section id) is scrolled into view first so the
 * lazy module loads; once the real section replaces it we scroll to it again
 * and re-check after the surrounding sections have settled.
 */
function scrollToLazySection(id: string) {
  try {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    /* jsdom does not implement scrollIntoView */
  }

  let tries = 0;
  let corrected = false;
  const attempt = () => {
    const el = document.getElementById(id);
    if (!el) return;
    const isReal = el.getAttribute('aria-hidden') !== 'true';
    if (isReal && !corrected) {
      corrected = true;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        /* jsdom does not implement scrollIntoView */
      }
      window.setTimeout(() => {
        try {
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          /* jsdom does not implement scrollIntoView */
        }
      }, 600);
      return;
    }
    if (!isReal && tries++ < 120) window.setTimeout(attempt, 100);
  };
  attempt();
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
  return <div ref={ref} id={id} className={className} aria-hidden="true" />;
}
