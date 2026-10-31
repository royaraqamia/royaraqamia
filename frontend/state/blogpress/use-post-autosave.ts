'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { updatePost } from '@/frontend/api/blogpress';
import type { Post } from '@/shared/contracts/blogpress';

const AUTOSAVE_DEBOUNCE_MS = 1200;

/** Persists the draft fields; resolves `true` once they are safely stored. */
export type PostPersist = (fields: {
  slug: string;
  content: string;
  cover_image: string;
  meta_title: string;
  meta_desc: string;
}) => Promise<boolean>;

type PostFields = Parameters<PostPersist>[0];

/** Whether a write's snapshot still matches what the editor currently holds. */
function fieldsEqual(a: PostFields, b: PostFields): boolean {
  return (
    a.slug === b.slug &&
    a.content === b.content &&
    a.cover_image === b.cover_image &&
    a.meta_title === b.meta_title &&
    a.meta_desc === b.meta_desc
  );
}

export function usePostAutosave(post: Post, persist?: PostPersist) {
  const [content, setContent] = useState(post.content ?? '');
  const [slug, setSlug] = useState(post.slug);
  const [coverImage, setCoverImage] = useState(post.cover_image ?? '');
  const [metaTitle, setMetaTitle] = useState(post.meta_title ?? '');
  const [metaDesc, setMetaDesc] = useState(post.meta_desc ?? '');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const contentRef = useRef(content);
  const slugRef = useRef(slug);
  const coverImageRef = useRef(coverImage);
  const metaTitleRef = useRef(metaTitle);
  const metaDescRef = useRef(metaDesc);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const persistRef = useRef(persist);
  persistRef.current = persist;
  // A save that lands while the editor holds newer text asks for one more
  // flush once it settles; this holds that queued timer (and lets unmount drop it).
  const reflushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAllFieldsRef = useRef<() => Promise<void>>(async () => {});

  // One sync for every draft field, so a write compares its snapshot against the
  // latest committed render rather than a mixture of them.
  useEffect(() => {
    contentRef.current = content;
    slugRef.current = slug;
    coverImageRef.current = coverImage;
    metaTitleRef.current = metaTitle;
    metaDescRef.current = metaDesc;
  }, [content, slug, coverImage, metaTitle, metaDesc]);

  const readFields = useCallback(
    (): PostFields => ({
      slug: slugRef.current,
      content: contentRef.current,
      cover_image: coverImageRef.current,
      meta_title: metaTitleRef.current,
      meta_desc: metaDescRef.current,
    }),
    []
  );

  // A ref that tracks whether the user edited anything since mount, so the
  // debounce never fires a redundant save on initial load.
  const hasEditedRef = useRef(false);

  useEffect(() => {
    if (hasEditedRef.current) {
      isDirtyRef.current = true;
      setIsDirty(true);
    }
    hasEditedRef.current = true;
  }, [content, slug, coverImage, metaTitle, metaDesc]);

  const saveAllFields = useCallback(async () => {
    if (!isDirtyRef.current || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    // The snapshot this write is responsible for. Anything typed from here on
    // is not covered by its success, however the write resolves.
    const written = readFields();
    let saved = false;
    try {
      // Local-first: when the editor hands us a Local Store writer, the write
      // lands in IndexedDB and an Outbox intent carries it to the server.
      if (persistRef.current) {
        saved = await persistRef.current(written);
      } else {
        const result = await updatePost(post.id, written);
        saved = result?.message === 'تمَّ حفظ المنشور';
      }
      if (saved) {
        setLastSaved(new Date());
        // Only the fields that actually reached storage may be marked clean: an
        // edit typed while the write was in flight is still unsaved, and its own
        // debounce either already fired against `isSavingRef` or is about to see
        // the ref cleared.
        if (fieldsEqual(written, readFields())) {
          isDirtyRef.current = false;
          setIsDirty(false);
        }
      }
    } catch {
      // Silently fail on auto-save
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      // A successful write that did not cover the current fields leaves the hook
      // dirty with no timer of its own: flush once, once this save has settled.
      // A failed write is left to the next edit or explicit save, as before.
      if (saved && isDirtyRef.current && reflushTimerRef.current === null) {
        reflushTimerRef.current = setTimeout(() => {
          reflushTimerRef.current = null;
          void saveAllFieldsRef.current();
        }, 0);
      }
    }
  }, [post.id, readFields]);

  saveAllFieldsRef.current = saveAllFields;

  useEffect(
    () => () => {
      if (reflushTimerRef.current !== null) {
        clearTimeout(reflushTimerRef.current);
        reflushTimerRef.current = null;
      }
    },
    []
  );

  const markSaved = useCallback(() => {
    isDirtyRef.current = false;
    setIsDirty(false);
    setLastSaved(new Date());
  }, []);

  // Debounced auto-save on every field change (guarded to skip mount).
  useEffect(() => {
    if (!hasEditedRef.current) return;
    const timer = setTimeout(() => {
      saveAllFields();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, slug, coverImage, metaTitle, metaDesc, saveAllFields]);

  // Flush pending changes whenever the tab is hidden or the page is left.
  useEffect(() => {
    const handler = (e: Event) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isDirtyRef.current) {
        saveAllFields();
      }
    };
    window.addEventListener('beforeunload', handler);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handler);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveAllFields]);

  // ⌘/Ctrl+S forces an immediate save of pending changes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAllFields();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveAllFields]);

  return {
    content,
    setContent,
    slug,
    setSlug,
    coverImage,
    setCoverImage,
    metaTitle,
    setMetaTitle,
    metaDesc,
    setMetaDesc,
    isDirty,
    lastSaved,
    isSaving,
    saveAllFields,
    markSaved,
  };
}
