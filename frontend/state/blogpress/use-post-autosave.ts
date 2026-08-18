'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { updatePost } from '@/frontend/api/blogpress';
import type { Post } from '@/shared/contracts/blogpress';

const AUTOSAVE_DEBOUNCE_MS = 1200;

export function usePostAutosave(post: Post) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content ?? '');
  const [slug, setSlug] = useState(post.slug);
  const [coverImage, setCoverImage] = useState(post.cover_image ?? '');
  const [metaTitle, setMetaTitle] = useState(post.meta_title ?? '');
  const [metaDesc, setMetaDesc] = useState(post.meta_desc ?? '');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const contentRef = useRef(content);
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const coverImageRef = useRef(coverImage);
  const metaTitleRef = useRef(metaTitle);
  const metaDescRef = useRef(metaDesc);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);
  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);
  useEffect(() => {
    coverImageRef.current = coverImage;
  }, [coverImage]);
  useEffect(() => {
    metaTitleRef.current = metaTitle;
  }, [metaTitle]);
  useEffect(() => {
    metaDescRef.current = metaDesc;
  }, [metaDesc]);

  // A ref that tracks whether the user edited anything since mount, so the
  // debounce never fires a redundant save on initial load.
  const hasEditedRef = useRef(false);

  useEffect(() => {
    if (hasEditedRef.current) {
      isDirtyRef.current = true;
      setIsDirty(true);
    }
    hasEditedRef.current = true;
  }, [title, content, slug, coverImage, metaTitle, metaDesc]);

  const saveAllFields = useCallback(async () => {
    if (!isDirtyRef.current || isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    const fields = {
      title: titleRef.current,
      slug: slugRef.current,
      content: contentRef.current,
      cover_image: coverImageRef.current,
      meta_title: metaTitleRef.current,
      meta_desc: metaDescRef.current,
    };
    try {
      const result = await updatePost(post.id, fields);
      if (result?.message === 'تمَّ حفظ المقال') {
        isDirtyRef.current = false;
        setIsDirty(false);
        setLastSaved(new Date());
      }
    } catch {
      // Silently fail on auto-save
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }, [post.id]);

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
  }, [title, content, slug, coverImage, metaTitle, metaDesc, saveAllFields]);

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
    title,
    setTitle,
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
