'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  addDownloadBlock,
  fetchDownloadBlocklist,
  fetchDownloadJobs,
  fetchDownloadPlatforms,
  fetchDownloaderSettings,
  removeDownloadBlock,
  setDownloadPlatformEnabled,
  updateDownloaderSettings,
  type DownloadJobFilters,
} from '@/frontend/api/admin/downloader';
import { logger } from '@/frontend/shared/logger';
import type {
  DownloadBlockKind,
  DownloadBlocklistEntry,
  DownloadJobPage,
  DownloadPlatformView,
  DownloadSettings,
} from '@/shared/contracts/downloader';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdminDownloadJobs(filters: DownloadJobFilters = {}) {
  const { page: pageNumber, status, search } = filters;
  const [result, setResult] = useState<DownloadJobPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchDownloadJobs({ page: pageNumber, status, search }));
    } catch (err) {
      logger.error('Failed to load download jobs', { error: String(err) });
      setError(messageOf(err, 'تعذّر تحميل طلبات التَّنزيل.'));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, status, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { result, loading, error, reload };
}

export function useAdminDownloadBlocklist() {
  const [entries, setEntries] = useState<DownloadBlocklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchDownloadBlocklist());
    } catch (err) {
      logger.error('Failed to load download blocklist', { error: String(err) });
      setError(messageOf(err, 'تعذّر تحميل قائمة الحظر.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const add = useCallback(async (kind: DownloadBlockKind, value: string) => {
    setBusy(true);
    try {
      const entry = await addDownloadBlock({ kind, value });
      setEntries((current) => [entry, ...current]);
      toast.success('تمت إضافة الحظر.');
      return true;
    } catch (err) {
      toast.error(messageOf(err, 'تعذّر إضافة الحظر.'));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    try {
      await removeDownloadBlock(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
      toast.success('تمت إزالة الحظر.');
    } catch (err) {
      toast.error(messageOf(err, 'تعذّر إزالة الحظر.'));
    } finally {
      setBusy(false);
    }
  }, []);

  return { entries, loading, error, busy, reload, add, remove };
}

export function useAdminDownloadPlatforms() {
  const [platforms, setPlatforms] = useState<DownloadPlatformView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlatforms(await fetchDownloadPlatforms());
    } catch (err) {
      logger.error('Failed to load download platforms', { error: String(err) });
      setError(messageOf(err, 'تعذّر تحميل المنصّات.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggle = useCallback(async (id: string, enabled: boolean) => {
    setBusyId(id);
    try {
      const updated = await setDownloadPlatformEnabled(id, enabled);
      setPlatforms((current) =>
        current.map((platform) => (platform.id === id ? updated : platform))
      );
      toast.success(enabled ? 'تم تفعيل المنصّة.' : 'تم تعطيل المنصّة.');
    } catch (err) {
      toast.error(messageOf(err, 'تعذّر تحديث المنصّة.'));
    } finally {
      setBusyId(null);
    }
  }, []);

  return { platforms, loading, error, busyId, reload, toggle };
}

export function useAdminDownloaderSettings() {
  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchDownloaderSettings());
    } catch (err) {
      logger.error('Failed to load downloader settings', { error: String(err) });
      setError(messageOf(err, 'تعذّر تحميل الإعدادات.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (patch: Partial<DownloadSettings>) => {
    setSaving(true);
    try {
      setSettings(await updateDownloaderSettings(patch));
      toast.success('تم حفظ الإعدادات.');
    } catch (err) {
      toast.error(messageOf(err, 'تعذّر حفظ الإعدادات.'));
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, loading, error, saving, reload, save };
}
