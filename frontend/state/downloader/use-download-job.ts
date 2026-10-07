'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TERMINAL_DOWNLOAD_STATUSES,
  type DownloadFormat,
  type DownloadJob,
} from '@/shared/contracts/downloader';
import { createDownloadJob, getDownloadJob } from '@/frontend/api/downloader';

const POLL_INTERVAL_MS = 2000;

function isTerminal(job: DownloadJob): boolean {
  return TERMINAL_DOWNLOAD_STATUSES.includes(job.status);
}

/**
 * Owns one Download Job from creation to a terminal status. Polls the status
 * endpoint until the job reaches `ready`, `failed` or `expired`.
 */
export function useDownloadJob() {
  const [job, setJob] = useState<DownloadJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const next = await getDownloadJob(id);
        setJob(next);
        if (isTerminal(next)) {
          setLoading(false);
          stopPolling();
          return;
        }
        timer.current = setTimeout(() => void poll(id), POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر متابعة حالة التنزيل.');
        setLoading(false);
        stopPolling();
      }
    },
    [stopPolling]
  );

  const start = useCallback(
    async (url: string, format: DownloadFormat, turnstileToken?: string) => {
      setLoading(true);
      setError(null);
      setJob(null);
      stopPolling();
      try {
        const created = await createDownloadJob({ url, format, turnstileToken });
        setJob(created);
        if (isTerminal(created)) {
          setLoading(false);
          return;
        }
        timer.current = setTimeout(() => void poll(created.id), POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'تعذّر بدء التنزيل.');
        setLoading(false);
      }
    },
    [poll, stopPolling]
  );

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setError(null);
    setLoading(false);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { job, loading, error, start, reset };
}
