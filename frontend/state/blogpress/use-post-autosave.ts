'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { updatePost } from '@/frontend/api/blogpress';
import type { Post } from '@/shared/contracts/blogpress';

export function usePostAutosave(post: Post) {
  const [title, setTitle] = useState(post.title);
  const [content, setContent] = useState(post.content ?? '');
  const [slug, setSlug] = useState(post.slug);
  const [coverImage, setCoverImage] = useState(post.cover_image ?? '');
  const [metaTitle, setMetaTitle] = useState(post.meta_title ?? '');
  const [metaDesc, setMetaDesc] = useState(post.meta_desc ?? '');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const contentRef = useRef(content);
  const titleRef = useRef(title);
  const slugRef = useRef(slug);
  const coverImageRef = useRef(coverImage);
  const metaTitleRef = useRef(metaTitle);
  const metaDescRef = useRef(metaDesc);
  const isDirtyRef = useRef(false);

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

  useEffect(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
  }, [title, content, slug, coverImage, metaTitle, metaDesc]);

  const saveAllFields = useCallback(async () => {
    if (!isDirtyRef.current) return;
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
    }
  }, [post.id]);

  const markSaved = useCallback(() => {
    isDirtyRef.current = false;
    setIsDirty(false);
    setLastSaved(new Date());
  }, []);

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

  useEffect(() => {
    const autoSaveRef = setInterval(() => {
      saveAllFields();
    }, 30000);
    return () => {
      clearInterval(autoSaveRef);
    };
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
    saveAllFields,
    markSaved,
  };
}
