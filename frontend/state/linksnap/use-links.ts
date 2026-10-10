'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listLinks,
  updateLink,
  deleteLink,
  type LinkUpdateBody,
  type ShortenedLink,
} from '@/frontend/api/linksnap';
import { useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';

/**
 * The link list. Inside a `LinksnapProvider` the list renders from the Local
 * Store (offline-first, ADR-0028); outside one it falls back to the network so
 * the admin console and any legacy caller keep working unchanged.
 */
export function useLinks(token: string, refreshTrigger: number) {
  const context = useLinksnapContext();
  const [links, setLinks] = useState<ShortenedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    if (context) {
      await context.refresh();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLinks(await listLinks(token));
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || 'فشل في تحميل روابطك المختصَرة.');
    } finally {
      setLoading(false);
    }
  }, [context, token]);

  useEffect(() => {
    if (context) return undefined;
    if (token) {
      const timer = setTimeout(() => fetchLinks(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [token, refreshTrigger, fetchLinks, context]);

  const handleDelete = useCallback((key: string) => {
    setLinks((prev) => prev.filter((l) => (l.clientId ?? l.code) !== key && l.code !== key));
  }, []);

  const applyLinkUpdate = useCallback((key: string, link: ShortenedLink) => {
    setLinks((prev) => prev.map((l) => ((l.clientId ?? l.code) === key ? { ...l, ...link } : l)));
  }, []);

  return {
    links: context ? context.links : links,
    loading: context ? context.loading : loading,
    error: context ? null : error,
    fetchLinks,
    handleDelete,
    applyLinkUpdate,
  };
}

export function useUpdateLink(token: string) {
  const context = useLinksnapContext();
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateLinkAction = useCallback(
    async (clientId: string, changes: LinkUpdateBody) => {
      setUpdateLoading(true);
      setUpdateError(null);
      try {
        if (context) {
          return await context.updateLink(clientId, {
            newCode: changes.newCode,
            originalUrl: changes.originalUrl,
            expiresAt: changes.expiresAt,
            password: changes.password,
          });
        }
        return await updateLink(clientId, token, changes);
      } catch (err: unknown) {
        setUpdateError(err instanceof Error ? err.message : 'خطأ في تحديث الرَّابط.');
        throw err;
      } finally {
        setUpdateLoading(false);
      }
    },
    [context, token]
  );

  return { updateLink: updateLinkAction, updateLoading, updateError };
}

export function useDeleteLink(token: string) {
  const context = useLinksnapContext();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteLinkAction = useCallback(
    async (clientId: string) => {
      setDeleteError(null);
      try {
        if (context) {
          await context.deleteLink(clientId);
          return;
        }
        await deleteLink(clientId, token);
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : 'خطأ في حذف الرَّابط.');
        throw err;
      }
    },
    [context, token]
  );

  return { deleteLink: deleteLinkAction, deleteError };
}
