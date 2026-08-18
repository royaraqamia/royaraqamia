'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listLinks,
  updateLink,
  deleteLink,
  type LinkUpdateBody,
  type ShortenedLink,
} from '@/frontend/api/linksnap';

export function useLinks(token: string, refreshTrigger: number) {
  const [links, setLinks] = useState<ShortenedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await listLinks(token));
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'فشل في تحميل روابطك المختصرة.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      const timer = setTimeout(() => fetchLinks(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [token, refreshTrigger, fetchLinks]);

  const handleDelete = useCallback((code: string) => {
    setLinks((prev) => prev.filter((l) => l.code !== code));
  }, []);

  const handleUpdate = useCallback((code: string, newUrl: string) => {
    setLinks((prev) => prev.map((l) => (l.code === code ? { ...l, originalUrl: newUrl } : l)));
  }, []);

  const applyLinkUpdate = useCallback((prevCode: string, link: ShortenedLink) => {
    setLinks((prev) => prev.map((l) => (l.code === prevCode ? { ...l, ...link } : l)));
  }, []);

  return { links, loading, error, fetchLinks, handleDelete, handleUpdate, applyLinkUpdate };
}

export function useUpdateLink(token: string) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateLinkAction = useCallback(
    async (code: string, changes: LinkUpdateBody) => {
      setUpdateLoading(true);
      setUpdateError(null);
      try {
        return await updateLink(code, token, changes);
      } catch (err: unknown) {
        setUpdateError(err instanceof Error ? err.message : 'خطأ في تحديث الرابط.');
        throw err;
      } finally {
        setUpdateLoading(false);
      }
    },
    [token]
  );

  return { updateLink: updateLinkAction, updateLoading, updateError };
}

export function useDeleteLink(token: string) {
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteLinkAction = useCallback(
    async (code: string) => {
      setDeleteError(null);
      try {
        await deleteLink(code, token);
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : 'خطأ في حذف الرابط.');
        throw err;
      }
    },
    [token]
  );

  return { deleteLink: deleteLinkAction, deleteError };
}
