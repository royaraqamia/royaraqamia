'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plug, Plus, RefreshCw, Unplug } from 'lucide-react';

import { MCP_CONNECTED_APPS_COPY } from './mcp-connected-apps-copy';

import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';
import {
  disconnectAllMcpConnectedApps,
  disconnectMcpConnectedApp,
  getMcpConnectedApps,
} from '@/frontend/api/mcp-connected-apps';
import { formatHijriDate, timeAgoParts } from '@/frontend/shared/format';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { ApiError } from '@/frontend/transport/http';
import { useSession } from '@/frontend/state/session-provider';

/**
 * "Last used" in this surface's own words (ADR-0104): the formatter answers a
 * unit and a count, and the sentence is the generated copy's, so the app renders
 * the same one from the same source.
 */
export function timeAgoLabel(dateStr: string): string {
  const parts = timeAgoParts(dateStr);

  switch (parts.unit) {
    case 'now':
      return MCP_CONNECTED_APPS_COPY.agoNow;
    case 'minutes':
      return MCP_CONNECTED_APPS_COPY.agoMinutes.replace('{count}', String(parts.count));
    case 'hours':
      return MCP_CONNECTED_APPS_COPY.agoHours.replace('{count}', String(parts.count));
    case 'days':
      return MCP_CONNECTED_APPS_COPY.agoDays.replace('{count}', String(parts.count));
    case 'weeks':
      return MCP_CONNECTED_APPS_COPY.agoWeeks.replace('{count}', String(parts.count));
    case 'date':
      return formatHijriDate(dateStr);
  }
}

/** The name a row shows: the client's own, or the generic one for a nameless client. */
export function connectedAppName(connectedApp: McpConnectedApp): string {
  return connectedApp.clientName ?? MCP_CONNECTED_APPS_COPY.appName;
}

/**
 * The MCP clients connected to the signed-in account.
 *
 * The list is read from the server rather than filtered locally, because the
 * server is the record of what is still live: a revocation that half-succeeded
 * must not look complete because the client removed the row optimistically.
 *
 * The page under this view is a data-free shell the worker may cache (#448), so
 * the guard lives here — the session provider answers network failure as "never
 * a logout", and a guest is pointed at sign-in in place. The read runs on the
 * never-cache `/api/me` prefix, which is what keeps an offline visit honest:
 * the shared needs-connection state instead of the list's stale look-alike.
 */
export function McpConnectedAppsView() {
  const { user, isLoading } = useSession();
  const [connectedApps, setConnectedApps] = useState<McpConnectedApp[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadOffline, setLoadOffline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [target, setTarget] = useState<McpConnectedApp | 'all' | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setLoadOffline(false);
    try {
      setConnectedApps(await getMcpConnectedApps());
    } catch (error) {
      setConnectedApps(null);
      setLoadOffline(error instanceof ApiError && error.isNetworkError);
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;
    void load();
  }, [isLoading, user, load]);

  const confirmDisconnect = async () => {
    if (!target) return;

    setIsDisconnecting(true);
    setActionError(null);

    const result =
      target === 'all'
        ? await disconnectAllMcpConnectedApps()
        : await disconnectMcpConnectedApp(target.clientId);

    setIsDisconnecting(false);
    setTarget(null);

    if (!result.success) {
      setActionError(result.error ?? MCP_CONNECTED_APPS_COPY.disconnectFailed);
      return;
    }

    await load();
  };

  if (isLoading) {
    return (
      <div
        className="space-y-2.5"
        aria-busy="true"
        aria-label={MCP_CONNECTED_APPS_COPY.loadingLabel}
      >
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!user)
    return (
      <SignInCta href="/auth/login?redirect=/account/connected-apps">
        {MCP_CONNECTED_APPS_COPY.signIn}
      </SignInCta>
    );

  if (loadFailed) {
    if (loadOffline) {
      return (
        <NeedsConnection message={MCP_CONNECTED_APPS_COPY.offline} onRetry={() => void load()} />
      );
    }

    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-bold text-destructive sm:text-base">
          {MCP_CONNECTED_APPS_COPY.failed}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          <span>{MCP_CONNECTED_APPS_COPY.retry}</span>
        </button>
      </div>
    );
  }

  if (connectedApps === null) {
    return (
      <div
        className="space-y-2.5"
        aria-busy="true"
        aria-label={MCP_CONNECTED_APPS_COPY.loadingLabel}
      >
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  const hasConnectedApps = connectedApps.length > 0;

  return (
    <div className="space-y-4">
      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
        >
          {actionError}
        </p>
      )}

      {hasConnectedApps ? (
        <>
          <ul className="space-y-2.5">
            {connectedApps.map((connectedApp) => (
              <li
                key={connectedApp.clientId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Plug aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-bold text-foreground sm:text-base">
                      {connectedAppName(connectedApp)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span>
                        {MCP_CONNECTED_APPS_COPY.lastUsed}{' '}
                        {connectedApp.lastUsedAt
                          ? timeAgoLabel(connectedApp.lastUsedAt)
                          : MCP_CONNECTED_APPS_COPY.neverUsed}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {MCP_CONNECTED_APPS_COPY.connectedSince.replace(
                          '{date}',
                          formatHijriDate(connectedApp.connectedAt)
                        )}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTarget(connectedApp)}
                  aria-label={MCP_CONNECTED_APPS_COPY.disconnectAria.replace(
                    '{name}',
                    connectedAppName(connectedApp)
                  )}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive/90 transition-safe duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 sm:text-sm"
                >
                  <Unplug aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{MCP_CONNECTED_APPS_COPY.disconnect}</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setTarget('all')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive/90 transition-safe duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
          >
            <Unplug aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{MCP_CONNECTED_APPS_COPY.disconnectAll}</span>
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <Plug aria-hidden="true" size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-foreground sm:text-lg">
              {MCP_CONNECTED_APPS_COPY.emptyTitle}
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {MCP_CONNECTED_APPS_COPY.emptyBody}
            </p>
          </div>
        </div>
      )}

      <Link
        href="/mcp/guide"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span>{MCP_CONNECTED_APPS_COPY.connectNew}</span>
      </Link>

      <ConfirmDialog
        open={target !== null}
        title={
          target === 'all'
            ? MCP_CONNECTED_APPS_COPY.confirmDisconnectAllTitle
            : MCP_CONNECTED_APPS_COPY.confirmDisconnectTitle
        }
        message={
          target === 'all'
            ? MCP_CONNECTED_APPS_COPY.confirmDisconnectAllMessage
            : MCP_CONNECTED_APPS_COPY.confirmDisconnectMessage.replace(
                '{name}',
                target ? connectedAppName(target) : MCP_CONNECTED_APPS_COPY.appName
              )
        }
        confirmLabel={
          target === 'all'
            ? MCP_CONNECTED_APPS_COPY.confirmDisconnectAll
            : MCP_CONNECTED_APPS_COPY.confirmDisconnect
        }
        cancelLabel={MCP_CONNECTED_APPS_COPY.cancel}
        onConfirm={() => void confirmDisconnect()}
        onCancel={() => {
          if (!isDisconnecting) setTarget(null);
        }}
        isConfirming={isDisconnecting}
        icon={Unplug}
      />
    </div>
  );
}
