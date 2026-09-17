'use client';

import { useEffect, useRef } from 'react';

interface PostViewTrackerProps {
  slug: string;
}

/**
 * Fires the view-count POST once per mount. Renders nothing; the count is a
 * fire-and-forget metric, so failures are swallowed. A ref guard keeps the
 * React StrictMode double-invoke in development from double counting.
 */
export function PostViewTracker({ slug }: PostViewTrackerProps) {
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    fetch(`/api/blog/${slug}/view`, { method: 'POST' }).catch(() => undefined);
  }, [slug]);

  return null;
}
