'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Unplug,
} from 'lucide-react';

import { MCP_MARKETPLACE_COPY as COPY } from './marketplace-copy';

import type { McpCatalogConnectReason, McpCatalogRow } from '@/shared/contracts/mcp-catalog';
import type {
  McpConnection,
  McpMarketplaceTab,
  McpPermissionLevel,
} from '@/shared/contracts/mcp-marketplace';
import { McpConnectedAppsView } from '@/frontend/ui/account/mcp-connected-apps-view';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useSession } from '@/frontend/state/session-provider';
import { getMcpConnections, startMcpConnection } from '@/frontend/api/mcp-connections';
import { searchMcpCatalog } from '@/frontend/api/mcp-catalog';
import { formatHijriDate } from '@/frontend/shared/format';
import { ApiError } from '@/frontend/transport/http';

/**
 * The marketplace behind `تطبيقاتنا` (ADR-0155, phase 3 / #1224).
 *
 * Two tabs on one screen, with the tab in the URL so a tab is shareable and the
 * back button still works:
 *
 * - `apps` (the default) is what نور reaches: the member's connections and a
 *   search over the mirrored registry.
 * - `inbound` is what reaches the member: the list that used to be
 *   `/account/connected-apps`, rendered here rather than linked away.
 *
 * The states are the server's answers, not local guesses: signed out, a search
 * that matched nothing, a catalogue that could not be read, a connection whose
 * provider is unreachable, and the connect callback's four outcomes. Each has
 * its own sentence so an empty list never stands in for a failure.
 */

export interface McpMarketplaceViewProps {
  tab: McpMarketplaceTab;
  /** The callback's `?connect=` outcome, if this visit is a return from one. */
  connect: string | null;
}

export function McpMarketplaceView({ tab, connect }: McpMarketplaceViewProps) {
  return (
    <div className="cv-auto mx-auto max-w-3xl px-4">
      <header className="mb-6 flex flex-col items-center text-center sm:mb-8">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {COPY.pageIntro}
        </p>
      </header>

      <MarketplaceTabs tab={tab} />

      <div className="mt-6">
        {tab === 'inbound' ? (
          <McpConnectedAppsView heading={false} />
        ) : (
          <McpAppsTab connect={connect} />
        )}
      </div>
    </div>
  );
}

/**
 * The tab is a link, not a button that rewrites history: `/mcp/apps` is the
 * outbound tab, `?tab=inbound` the other, and the browser's back button walks
 * between them exactly as it walks between pages.
 */
function MarketplaceTabs({ tab }: { tab: McpMarketplaceTab }) {
  const tabs: Array<{ id: McpMarketplaceTab; label: string; href: string }> = [
    { id: 'apps', label: COPY.tabApps, href: '/mcp/apps' },
    { id: 'inbound', label: COPY.tabInbound, href: '/mcp/apps?tab=inbound' },
  ];

  return (
    <nav
      aria-label={COPY.tabsLabel}
      className="mx-auto grid max-w-md grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-muted/40 p-1"
    >
      {tabs.map((entry) => {
        const active = entry.id === tab;
        return (
          <Link
            key={entry.id}
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded-xl bg-card px-3 py-2 text-center text-sm font-bold text-foreground shadow-xs'
                : 'rounded-xl px-3 py-2 text-center text-sm font-bold text-muted-foreground transition-safe duration-150 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
            }
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}

function McpAppsTab({ connect }: { connect: string | null }) {
  const { user, isLoading } = useSession();

  const [connections, setConnections] = useState<McpConnection[] | null>(null);
  const [connectionsFailed, setConnectionsFailed] = useState(false);
  const [connectionsOffline, setConnectionsOffline] = useState(false);

  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<McpCatalogRow[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchOffline, setSearchOffline] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRequest = useRef(0);

  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setConnectionsFailed(false);
    setConnectionsOffline(false);
    try {
      setConnections(await getMcpConnections());
    } catch (error) {
      setConnections(null);
      setConnectionsOffline(error instanceof ApiError && error.isNetworkError);
      setConnectionsFailed(true);
    }
  }, []);

  useEffect(() => {
    if (isLoading || !user) return;
    void loadConnections();
  }, [isLoading, user, loadConnections]);

  /** One page of the catalogue; `append` is "تحميل المزيد", not a new search. */
  const runSearch = useCallback(async (term: string, cursor: string | null, append: boolean) => {
    // The newest search owns the screen: a slower older answer arriving after a
    // newer one must not overwrite it, or "no results" lands under the wrong word.
    const request = searchRequest.current + 1;
    searchRequest.current = request;

    setSearching(true);
    setSearchFailed(false);
    setSearchOffline(false);
    try {
      const page = await searchMcpCatalog({ q: term, cursor });
      if (request !== searchRequest.current) return;
      setServers((current) => (append && current ? [...current, ...page.servers] : page.servers));
      setNextCursor(page.nextCursor);
      setSearchTerm(term);
    } catch (error) {
      if (request !== searchRequest.current) return;
      if (!append) setServers(null);
      setSearchOffline(error instanceof ApiError && error.isNetworkError);
      setSearchFailed(true);
    } finally {
      if (request === searchRequest.current) setSearching(false);
    }
  }, []);

  // A search while the member types, delayed so a word is not a request per
  // keystroke. `searchTerm` is what the answer belongs to, which is what keeps
  // "no results" from being drawn under a newer term.
  useEffect(() => {
    if (isLoading || !user) return;
    const timer = setTimeout(() => void runSearch(query.trim(), null, false), 300);
    return () => clearTimeout(timer);
  }, [isLoading, user, query, runSearch]);

  const onConnect = async (registryName: string) => {
    setConnectingTo(registryName);
    setActionError(null);
    try {
      const { authorizeUrl } = await startMcpConnection(registryName);
      // The consent page is a third party's origin; the whole document leaves.
      window.location.assign(authorizeUrl);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : COPY.connectFailed);
      setConnectingTo(null);
    }
  };

  if (isLoading) return <LoadingBlocks />;

  if (!user) {
    return (
      <SignInCta href="/auth/login?redirect=/mcp/apps" visual="marketplace-cta">
        {COPY.signInBody}
      </SignInCta>
    );
  }

  return (
    <div className="space-y-8">
      <ConnectOutcome connect={connect} />

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
        >
          {actionError}
        </p>
      )}

      <section aria-labelledby="mcp-connections-title" className="space-y-3">
        <h2
          id="mcp-connections-title"
          className="text-base font-extrabold text-foreground sm:text-lg"
        >
          {COPY.connectionsTitle}
        </h2>

        {connectionsFailed ? (
          connectionsOffline ? (
            <NeedsConnection
              message={COPY.connectionsOffline}
              onRetry={() => void loadConnections()}
            />
          ) : (
            <FailureRow message={COPY.connectionsFailed} onRetry={() => void loadConnections()} />
          )
        ) : connections === null ? (
          <LoadingBlocks rows={1} />
        ) : connections.length === 0 ? (
          <EmptyCard title={COPY.connectionsEmptyTitle} body={COPY.connectionsEmptyBody} />
        ) : (
          <ul className="space-y-2.5">
            {connections.map((connection) => (
              <li key={connection.id}>
                <ConnectionCard connection={connection} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mcp-catalog-title" className="space-y-3">
        <h2 id="mcp-catalog-title" className="text-base font-extrabold text-foreground sm:text-lg">
          {COPY.searchLabel}
        </h2>

        <div className="flex gap-2">
          <label className="sr-only" htmlFor="mcp-catalog-search">
            {COPY.searchLabel}
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="mcp-catalog-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={COPY.searchPlaceholder}
              className="w-full rounded-xl border border-border/60 bg-card/70 py-2.5 pe-3 ps-9 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </div>
        </div>

        {searchFailed ? (
          searchOffline ? (
            <NeedsConnection
              message={COPY.searchOffline}
              onRetry={() => void runSearch(query.trim(), null, false)}
            />
          ) : (
            <FailureRow
              message={COPY.searchFailed}
              onRetry={() => void runSearch(query.trim(), null, false)}
            />
          )
        ) : servers === null ? (
          <LoadingBlocks rows={2} />
        ) : servers.length === 0 ? (
          <EmptyCard title={COPY.searchEmptyTitle} body={COPY.searchEmptyBody} />
        ) : (
          <>
            <ul className="space-y-2.5">
              {servers.map((server) => (
                <li key={server.registryName}>
                  <CatalogueRow
                    server={server}
                    connecting={connectingTo === server.registryName}
                    disabled={connectingTo !== null}
                    onConnect={() => void onConnect(server.registryName)}
                  />
                </li>
              ))}
            </ul>

            {nextCursor && (
              <button
                type="button"
                onClick={() => void runSearch(searchTerm, nextCursor, true)}
                disabled={searching}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2.5 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                {searching ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus aria-hidden="true" className="h-4 w-4" />
                )}
                <span>{COPY.more}</span>
              </button>
            )}
          </>
        )}

        {searching && servers !== null && (
          <p role="status" aria-live="polite" className="text-center text-xs text-muted-foreground">
            {COPY.searchLoading}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * The callback's failure outcomes, in the member's words. A successful consent
 * never reaches the list: the callback lands on `/mcp/apps/<id>`, which is where
 * the connection is explained (ADR-0155, decision 9).
 */
function ConnectOutcome({ connect }: { connect: string | null }) {
  if (!connect) return null;

  const sentences: Record<string, string> = {
    denied: COPY.connectDenied,
    invalid: COPY.connectInvalid,
    signin: COPY.connectSignin,
    blocked: COPY.connectBlocked,
    plan_limit: COPY.connectPlanLimit,
  };
  const sentence = sentences[connect] ?? COPY.connectError;

  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{sentence}</span>
    </p>
  );
}

/** One connection: its state, what it costs, and the way to manage it. */
function ConnectionCard({ connection }: { connection: McpConnection }) {
  const name = connection.displayName ?? connection.registryName;

  return (
    <Link
      href={`/mcp/apps/${encodeURIComponent(connection.id)}`}
      className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5 transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Plug aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-bold text-foreground sm:text-base">{name}</p>
          <p className="text-xs text-muted-foreground">
            <span>{COPY.toolCount.replace('{count}', String(connection.toolCount))}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {COPY.lastUsed}{' '}
              {connection.lastUsedAt ? formatHijriDate(connection.lastUsedAt) : COPY.neverUsed}
            </span>
          </p>
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <ConnectionStatusBadge status={connection.status} />
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-bold text-muted-foreground">
              {permissionLabel(connection.permissionLevel)}
            </span>
            {!connection.enabled && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-300">
                {COPY.connectionDisabled}
              </span>
            )}
          </p>
        </div>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 text-xs font-bold text-foreground sm:text-sm">
        {COPY.manage}
      </span>
    </Link>
  );
}

function ConnectionStatusBadge({ status }: { status: McpConnection['status'] }) {
  if (status === 'needs_reauth') {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-300">
        {COPY.statusNeedsReauth}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-bold text-destructive">
        {COPY.statusError}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-bold text-primary">
      {COPY.statusActive}
    </span>
  );
}

/** One catalogue row: the server's own name, its description, and connect. */
function CatalogueRow({
  server,
  connecting,
  disabled,
  onConnect,
}: {
  server: McpCatalogRow;
  connecting: boolean;
  disabled: boolean;
  onConnect: () => void;
}) {
  const blocked = server.connectable === false;

  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-bold text-foreground sm:text-base">
          {server.title ?? server.registryName}
          {server.nameAr && (
            <span className="ms-2 text-xs font-medium text-muted-foreground">{server.nameAr}</span>
          )}
        </p>
        {server.description && (
          <p dir="auto" className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {server.description}
          </p>
        )}
        <p className="text-xs">
          <span
            className={
              blocked
                ? 'font-bold text-amber-600 dark:text-amber-300'
                : 'font-bold text-muted-foreground'
            }
          >
            {connectableLabel(server)}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={onConnect}
        disabled={disabled || blocked}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-safe duration-150 ease-out hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-sm"
      >
        {connecting ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Plus aria-hidden="true" className="h-4 w-4" />
        )}
        <span>{connecting ? COPY.connecting : COPY.connect}</span>
      </button>
    </div>
  );
}

function connectableLabel(server: McpCatalogRow): string {
  if (server.connectable === true) return COPY.connectableYes;
  if (server.connectable === false) {
    return `${COPY.connectableNo} — ${reasonLabel(server.connectableReason)}`;
  }
  return COPY.connectableUnknown;
}

function reasonLabel(reason: McpCatalogConnectReason | null): string {
  switch (reason) {
    case 'no_metadata':
      return COPY.reasonNoMetadata;
    case 'no_registration':
      return COPY.reasonNoRegistration;
    case 'blocked':
      return COPY.reasonBlocked;
    default:
      return COPY.connectableNo;
  }
}

export function permissionLabel(level: McpPermissionLevel): string {
  switch (level) {
    case 'reads':
      return COPY.permissionReads;
    case 'all':
      return COPY.permissionAll;
    case 'ask':
      return COPY.permissionAsk;
  }
}

function LoadingBlocks({ rows = 2 }: { rows?: number }) {
  const blocks = useMemo(() => Array.from({ length: rows }, (_, index) => index), [rows]);

  return (
    <div className="space-y-2.5" aria-busy="true" aria-label={COPY.loadingLabel}>
      {blocks.map((block) => (
        <div
          key={block}
          className="h-20 rounded-2xl border border-border/40 bg-muted/40 animate-pulse"
        />
      ))}
    </div>
  );
}

function FailureRow({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
      <p className="flex items-center justify-center gap-2 text-sm font-bold text-destructive">
        <ShieldAlert aria-hidden="true" className="h-4 w-4" />
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <RefreshCw aria-hidden="true" className="h-4 w-4" />
        <span>{COPY.retry}</span>
      </button>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
        <Unplug aria-hidden="true" size={22} />
      </div>
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground sm:text-sm">{body}</p>
    </div>
  );
}
