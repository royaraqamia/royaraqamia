'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Loader2, RefreshCw, Unplug } from 'lucide-react';

import { MCP_MARKETPLACE_COPY as COPY } from './marketplace-copy';

import {
  MCP_PERMISSION_LEVELS,
  type McpConnectionDetail,
  type McpConnectionTool,
  type McpPermissionLevel,
} from '@/shared/contracts/mcp-marketplace';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useSession } from '@/frontend/state/session-provider';
import {
  disconnectMcpConnection,
  getMcpConnection,
  setMcpConnectionTool,
  startMcpConnection,
  updateMcpConnection,
} from '@/frontend/api/mcp-connections';
import { ApiError } from '@/frontend/transport/http';

/**
 * The post-connect screen: what a connection can reach and what it may do
 * (ADR-0155, phase 3 / #1224).
 *
 * The screen exists so the member sees what "on" means at the moment they can
 * still change it: every tool the server advertised, which ones write, each
 * switch, the connection's permission level, and «افصل». A connection is usable
 * the moment it is made — these are limits, not a second confirmation.
 *
 * A tool the server stopped advertising is drawn as stale rather than dropped,
 * so the member's switch survives a server's bad day and the screen can say the
 * list changed since connect.
 */
export function McpConnectionView({
  connectionId,
  connected,
}: {
  connectionId: string;
  connected: boolean;
}) {
  const { user, isLoading: sessionLoading } = useSession();
  const router = useRouter();

  const [connection, setConnection] = useState<McpConnectionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [failed, setFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyTool, setBusyTool] = useState<string | null>(null);
  const [savingPermission, setSavingPermission] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    setOffline(false);
    setNotFound(false);
    try {
      setConnection(await getMcpConnection(connectionId));
    } catch (error) {
      setConnection(null);
      setNotFound(error instanceof ApiError && error.status === 404);
      setOffline(error instanceof ApiError && error.isNetworkError);
      setFailed(true);
    }
  }, [connectionId]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    void load();
  }, [sessionLoading, user, load]);

  const changePermission = async (level: McpPermissionLevel) => {
    if (!connection || level === connection.permissionLevel) return;
    setSavingPermission(true);
    setActionError(null);
    const result = await updateMcpConnection(connection.id, { permissionLevel: level });
    setSavingPermission(false);
    if (!result.success) {
      setActionError(result.error ?? COPY.saveFailed);
      return;
    }
    await load();
  };

  const toggleEnabled = async () => {
    if (!connection) return;
    setSavingEnabled(true);
    setActionError(null);
    const result = await updateMcpConnection(connection.id, { enabled: !connection.enabled });
    setSavingEnabled(false);
    if (!result.success) {
      setActionError(result.error ?? COPY.saveFailed);
      return;
    }
    await load();
  };

  /**
   * The one repair a dead grant has (#1227): the same consent flow again. It
   * reuses the connection's slot — `start` finds the live row — so a member who
   * hit a cap is not asked to free one to reconnect an app they already have.
   */
  const reconnect = async () => {
    if (!connection) return;
    setReconnecting(true);
    setActionError(null);
    try {
      const { authorizeUrl } = await startMcpConnection(connection.registryName);
      // The consent page is a third party's origin; the whole document leaves.
      window.location.assign(authorizeUrl);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : COPY.reconnectFailed);
      setReconnecting(false);
    }
  };

  const toggleTool = async (tool: McpConnectionTool) => {
    if (!connection) return;
    setBusyTool(tool.name);
    setActionError(null);
    const result = await setMcpConnectionTool(connection.id, {
      toolName: tool.name,
      enabled: !tool.enabled,
    });
    setBusyTool(null);
    if (!result.success) {
      setActionError(result.error ?? COPY.toolFailed);
      return;
    }
    await load();
  };

  const disconnect = async () => {
    if (!connection) return;
    setDisconnecting(true);
    setActionError(null);
    const result = await disconnectMcpConnection(connection.id);
    setDisconnecting(false);
    setConfirmOpen(false);
    if (!result.success) {
      setActionError(result.error ?? COPY.saveFailed);
      return;
    }
    router.replace('/mcp/apps');
    router.refresh();
  };

  if (sessionLoading) return <LoadingBlocks />;

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-6 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-balance text-muted-foreground">
          {COPY.signInBody}
        </p>
        <SignInCta
          href={`/auth/login?redirect=${encodeURIComponent(`/mcp/apps/${connectionId}`)}`}
          visual="connection-cta"
        >
          {COPY.signIn}
        </SignInCta>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
        <p className="text-sm font-bold text-foreground sm:text-base">{COPY.detailNotFound}</p>
      </div>
    );
  }

  if (failed) {
    if (offline) {
      return <NeedsConnection message={COPY.detailOffline} onRetry={() => void load()} />;
    }
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <p className="text-sm font-bold text-destructive">{COPY.detailFailed}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          <span>{COPY.retry}</span>
        </button>
      </div>
    );
  }

  if (connection === null) return <LoadingBlocks />;

  const name = connection.displayName ?? connection.registryName;
  const staleTools = connection.tools.some((tool) => tool.stale);

  return (
    <div className="space-y-6">
      {connected && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-bold text-primary"
        >
          <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
          {COPY.connectedBanner}
        </p>
      )}

      <header className="space-y-3 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{name}</SectionTitleHighlight>
        </SectionTitle>
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-balance text-muted-foreground">
          {COPY.detailReach}
        </p>
      </header>

      {connection.status === 'needs_reauth' && (
        <div className="space-y-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="flex items-start gap-2 text-sm font-bold text-amber-700 dark:text-amber-300">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            {COPY.detailNeedsReauth}
          </p>
          <button
            type="button"
            onClick={() => void reconnect()}
            disabled={reconnecting}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {reconnecting ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {reconnecting ? COPY.reconnecting : COPY.reconnect}
          </button>
        </div>
      )}
      {connection.status === 'error' && (
        <Notice tone="danger">{connection.lastError ?? COPY.detailUnreachable}</Notice>
      )}
      {/* A refusal the provider answered with a scope, not a dead grant: the
          sentence names the permission and the widen control below is the
          repair. The connection stays usable for everything the grant covers. */}
      {connection.status === 'active' && connection.lastError && (
        <Notice tone="warning">{connection.lastError}</Notice>
      )}
      {staleTools && <Notice tone="warning">{COPY.detailStale}</Notice>}

      {actionError && <Notice tone="danger">{actionError}</Notice>}

      <section aria-labelledby="mcp-permission-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="mcp-permission-title" className="text-base font-extrabold text-foreground">
            {COPY.detailPermissionTitle}
          </h2>

          <button
            type="button"
            role="switch"
            aria-checked={connection.enabled}
            aria-label={connection.enabled ? COPY.connectionEnabled : COPY.connectionDisabled}
            onClick={() => void toggleEnabled()}
            disabled={savingEnabled}
            className={
              connection.enabled
                ? 'inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60'
                : 'inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-safe duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60'
            }
          >
            {savingEnabled ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {connection.enabled ? COPY.connectionEnabled : COPY.connectionDisabled}
          </button>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="mcp-permission-title"
          className="grid gap-2 sm:grid-cols-3"
        >
          {MCP_PERMISSION_LEVELS.map((level) => {
            const active = connection.permissionLevel === level;
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={savingPermission}
                onClick={() => void changePermission(level)}
                className={
                  active
                    ? 'rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-safe duration-150 ease-out disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                    : 'rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-bold text-muted-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                }
              >
                {permissionCopy(level)}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="mcp-scopes-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="mcp-scopes-title" className="text-base font-extrabold text-foreground">
            {COPY.detailScopesTitle}
          </h2>

          {/* One repair, one control: a dead grant already has its own button in
              the banner, and two of them for the same flow would read as two
              different actions. */}
          {connection.status !== 'needs_reauth' && (
            <button
              type="button"
              onClick={() => void reconnect()}
              disabled={reconnecting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:text-foreground disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {reconnecting ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {reconnecting ? COPY.reconnecting : COPY.widen}
            </button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{COPY.detailScopesBody}</p>

        {connection.scopes.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-xs text-muted-foreground">
            {COPY.detailScopesEmpty}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" aria-label={COPY.detailScopesTitle}>
            {connection.scopes.map((scope) => (
              <li
                key={scope}
                dir="ltr"
                className="rounded-lg border border-border/60 bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground"
              >
                {scope}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">{COPY.detailScopesAsk}</p>
      </section>

      <section aria-labelledby="mcp-tools-title" className="space-y-3">
        <h2 id="mcp-tools-title" className="text-base font-extrabold text-foreground">
          {COPY.detailToolsTitle}
        </h2>

        {connection.tools.length === 0 ? (
          <p className="rounded-2xl border border-border/50 bg-card/60 px-4 py-5 text-center text-sm text-muted-foreground">
            {COPY.detailToolsEmpty}
          </p>
        ) : (
          <ul className="space-y-2">
            {connection.tools.map((tool) => (
              <li
                key={tool.name}
                className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p dir="auto" className="truncate font-mono text-xs font-bold text-foreground">
                    {tool.name}
                  </p>
                  {tool.description && (
                    <p dir="auto" className="line-clamp-2 text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                  )}
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span
                      className={
                        tool.readOnly
                          ? 'rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-bold text-muted-foreground'
                          : 'rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-300'
                      }
                    >
                      {tool.readOnly ? COPY.toolReads : COPY.toolWrites}
                    </span>
                    {tool.stale && (
                      <span className="rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-bold text-destructive">
                        {COPY.toolStale}
                      </span>
                    )}
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={tool.enabled}
                  aria-label={tool.enabled ? COPY.toolEnabled : COPY.toolDisabled}
                  disabled={busyTool !== null}
                  onClick={() => void toggleTool(tool)}
                  className={
                    tool.enabled
                      ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-safe duration-150 ease-out disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                      : 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-bold text-muted-foreground transition-safe duration-150 ease-out disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
                  }
                >
                  {busyTool === tool.name ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {tool.enabled ? COPY.toolEnabled : COPY.toolDisabled}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive/90 transition-safe duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
        >
          <Unplug aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{COPY.detailDisconnect}</span>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={COPY.detailDisconnectTitle}
        message={COPY.detailDisconnectMessage.replace('{name}', name)}
        confirmLabel={COPY.confirmDisconnect}
        cancelLabel={COPY.cancel}
        onConfirm={() => void disconnect()}
        onCancel={() => {
          if (!disconnecting) setConfirmOpen(false);
        }}
        isConfirming={disconnecting}
        icon={Unplug}
      />
    </div>
  );
}

function permissionCopy(level: McpPermissionLevel): string {
  switch (level) {
    case 'reads':
      return COPY.permissionReads;
    case 'all':
      return COPY.permissionAll;
    case 'ask':
      return COPY.permissionAsk;
  }
}

function Notice({ tone, children }: { tone: 'warning' | 'danger'; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={
        tone === 'danger'
          ? 'flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive'
          : 'flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-600 dark:text-amber-300'
      }
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function LoadingBlocks() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label={COPY.loadingLabel}>
      <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
    </div>
  );
}
