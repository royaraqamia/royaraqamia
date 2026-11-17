'use client';

import { useCallback, useEffect, useState } from 'react';

import { clearScanHistory, getScanHistory } from '@/frontend/api/scan-history';
import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { SCAN_HISTORY_KIND_LABELS, type ScanHistoryEntry } from '@/shared/contracts/scan-history';
import { SCAN_HISTORY_COPY } from './scan-history-copy';

/**
 * The Scanner's history (#1430, ADR-0205).
 *
 * Below the card rather than inside it: the card is a measured box in the visual
 * contract, and a list that grows would move a height the gate records. What the
 * member reads is a summary — the kind of code, the service it named, the day it
 * was last read and how many times — because that is what a row holds. The
 * payload never reaches this list, or the server behind it.
 *
 * The section renders only for a signed-in member. A guest's scans are counted by
 * the plan limiter and nothing else, exactly as before: there is no row to keep
 * them against, and a history that silently began at sign-in would be a surprise.
 */
export function ScanHistory({
  signedIn,
  loading,
  reloadToken,
}: {
  signedIn: boolean;
  /** The session is still being read: draw nothing rather than "sign in". */
  loading: boolean;
  /** Bumped after a scan, so the row it just wrote appears without a reload. */
  reloadToken: number;
}) {
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setEntries(await getScanHistory());
      setState('ready');
    } catch {
      setState('failed');
    }
  }, []);

  useEffect(() => {
    if (!signedIn || loading) return;
    void load();
  }, [load, loading, reloadToken, signedIn]);

  useEffect(() => {
    setNotice(null);
  }, [reloadToken]);

  async function clear() {
    setClearing(true);
    try {
      await clearScanHistory();
      setEntries([]);
      setNotice(SCAN_HISTORY_COPY.cleared);
      setState('ready');
    } catch {
      setState('failed');
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  }

  return (
    <section aria-labelledby="scan-history-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="scan-history-title" className="text-base font-semibold">
          {SCAN_HISTORY_COPY.title}
        </h2>
        {signedIn && entries.length > 0 && !confirming && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            {SCAN_HISTORY_COPY.clear}
          </Button>
        )}
      </div>

      {!signedIn ? (
        <p className="text-sm text-muted-foreground">{SCAN_HISTORY_COPY.signedOut}</p>
      ) : state === 'failed' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {SCAN_HISTORY_COPY.failed}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {SCAN_HISTORY_COPY.retry}
          </Button>
        </div>
      ) : state === 'loading' && entries.length === 0 ? null : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{notice ?? SCAN_HISTORY_COPY.empty}</p>
      ) : (
        <Card>
          <CardContent className="p-3">
            <ul className="flex flex-col divide-y divide-border/60">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">
                    {entry.label ?? SCAN_HISTORY_KIND_LABELS[entry.kind]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.label ? `${SCAN_HISTORY_KIND_LABELS[entry.kind]} Â· ` : ''}
                    {entry.seenCount === 1
                      ? SCAN_HISTORY_COPY.seenOnce
                      : SCAN_HISTORY_COPY.seenMany.replace('{count}', String(entry.seenCount))}
                    {' Â· '}
                    {SCAN_HISTORY_COPY.lastSeen.replace('{date}', entry.lastSeenDate)}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {confirming && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{SCAN_HISTORY_COPY.clearQuestion}</p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={clearing}
            onClick={() => void clear()}
          >
            {SCAN_HISTORY_COPY.clearConfirm}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={clearing}
            onClick={() => setConfirming(false)}
          >
            {SCAN_HISTORY_COPY.cancel}
          </Button>
        </div>
      )}
    </section>
  );
}
