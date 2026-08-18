'use client';

import { useEffect } from 'react';
import { createPost } from '@/frontend/api/blogpress';

export function AutoCreatePost() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { id } = await createPost();
        if (!cancelled) window.location.assign(`/blogpress/editor/${id}`);
      } catch {
        if (!cancelled) window.location.assign('/blogpress/app');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
