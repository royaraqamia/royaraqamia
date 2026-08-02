'use client';

import { useCallback, useEffect, useState } from 'react';
import { LinksnapApiClient, type ShortenedLink } from '@/frontend/api/linksnap';

export function useLinks(token: string, refreshTrigger: number) {
  const [links, setLinks] = useState<ShortenedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await LinksnapApiClient.listLinks(token));
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

  return { links, loading, error, fetchLinks, handleDelete, handleUpdate };
}

export function useUpdateLink(token: string) {
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateLink = useCallback(
    async (code: string, url: string) => {
      setUpdateLoading(true);
      setUpdateError(null);
      try {
        return await LinksnapApiClient.updateLink(code, url, token);
      } catch (err: unknown) {
        setUpdateError(err instanceof Error ? err.message : 'خطأ في تحديث الرابط.');
        throw err;
      } finally {
        setUpdateLoading(false);
      }
    },
    [token]
  );

  return { updateLink, updateLoading, updateError };
}

export function useDeleteLink(token: string) {
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteLink = useCallback(
    async (code: string) => {
      setDeleteError(null);
      try {
        await LinksnapApiClient.deleteLink(code, token);
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : 'خطأ في حذف الرابط.');
        throw err;
      }
    },
    [token]
  );

  return { deleteLink, deleteError };
}
