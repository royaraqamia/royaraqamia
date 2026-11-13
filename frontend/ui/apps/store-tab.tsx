'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BadgeCheck,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShieldAlert,
  Unplug,
} from 'lucide-react';

import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';

import { appsCacheKey, readAppsCache, writeAppsCache } from './apps-cache';
import { MCP_STORE_COPY } from './store-copy';

import type { McpCatalogRow } from '@/shared/contracts/mcp-catalog';
import type { McpConnection, McpPermissionLevel } from '@/shared/contracts/mcp-marketplace';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { useSession } from '@/frontend/state/session-provider';
import { getMcpConnections, startMcpConnection } from '@/frontend/api/mcp-connections';
import { searchMcpCatalog } from '@/frontend/api/mcp-catalog';
import { formatHijriDate } from '@/frontend/shared/format';
import { ApiError } from '@/frontend/transport/http';

/**
 * The apps we reach: the member's connections and a search over the mirrored
 * registry (ADR-0155).
 *
 * The surface owns the search field, so this tab receives the term and owns
 * only what belongs to the answer: the debounce, the race guard, and the rows.
 * It seeds from the session cache and revalidates in the background, which is
 * what makes a second visit draw rows instead of a skeleton.
 */

interface StoreTabProps {
  query: string;
  /** The callback's `?connect=` outcome, if this visit is a return from one. */
  connect: string | null;
}

interface StorePage {
  servers: McpCatalogRow[];
  nextCursor: string | null;
}

export function StoreTab({ query, connect }: StoreTabProps) {
  const { user, isLoading } = useSession();
  const router = useRouter();
  const connectionsKey = user ? appsCacheKey(user.id, 'connections') : null;
  const storeKey = user ? appsCacheKey(user.id, 'store') : null;

  const cachedConnections = connectionsKey ? readAppsCache<McpConnection[]>(connectionsKey) : null;
  const cachedStore = storeKey ? readAppsCache<StorePage>(storeKey) : null;

  const [connections, setConnections] = useState<McpConnection[] | null>(cachedConnections ?? null);
  const [connectionsFailed, setConnectionsFailed] = useState(false);
  const [connectionsOffline, setConnectionsOffline] = useState(false);

  const [servers, setServers] = useState<McpCatalogRow[] | null>(cachedStore?.servers ?? null);
  const [nextCursor, setNextCursor] = useState<string | null>(cachedStore?.nextCursor ?? null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [searchOffline, setSearchOffline] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const searchRequest = useRef(0);
  // The first search on an empty box is not a keystroke, so it does not wait
  // for one: the tab draws its list immediately and only later terms debounce.
  const firstSearch = useRef(true);
  // The list as the last answer left it. A ref rather than the state value is
  // what keeps `runSearch` stable: a dependency on `servers` would re-run the
  // debounce after every answer and search forever.
  const serversRef = useRef<McpCatalogRow[] | null>(servers);

  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** The row whose ask is being read before the document leaves for the provider. */
  const [consentFor, setConsentFor] = useState<McpCatalogRow | null>(null);
  /** The key a member pasted for an `api_key` row (#1269); never rendered back. */
  const [apiKey, setApiKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);

  /** One connection per server: this is what keeps a linked row from offering to link again. */
  const connectionByRegistry = useMemo(() => {
    const byRegistry = new Map<string, McpConnection>();
    for (const connection of connections ?? []) byRegistry.set(connection.registryName, connection);
    return byRegistry;
  }, [connections]);

  const loadConnections = useCallback(async () => {
    setConnectionsFailed(false);
    setConnectionsOffline(false);
    try {
      const list = await getMcpConnections();
      setConnections(list);
      if (connectionsKey) writeAppsCache(connectionsKey, list);
    } catch (error) {
      setConnections(null);
      setConnectionsOffline(error instanceof ApiError && error.isNetworkError);
      setConnectionsFailed(true);
    }
  }, [connectionsKey]);

  useEffect(() => {
    if (isLoading || !user) return;
    void loadConnections();
  }, [isLoading, user, loadConnections]);

  /** One page of the catalogue; `append` is "تحميل المزيد", not a new search. */
  const runSearch = useCallback(
    async (term: string, cursor: string | null, append: boolean) => {
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
        const current = serversRef.current;
        const next = append && current ? [...current, ...page.servers] : page.servers;
        serversRef.current = next;
        setServers(next);
        setNextCursor(page.nextCursor);
        setSearchTerm(term);
        // Only the default first page is worth keeping: a term is the member's
        // own and would grow the cache with every word they typed.
        if (!append && term === '' && cursor === null && storeKey) {
          writeAppsCache(storeKey, { servers: next, nextCursor: page.nextCursor });
        }
      } catch (error) {
        if (request !== searchRequest.current) return;
        if (!append) setServers(null);
        setSearchOffline(error instanceof ApiError && error.isNetworkError);
        setSearchFailed(true);
      } finally {
        if (request === searchRequest.current) setSearching(false);
      }
    },
    [storeKey]
  );

  // A search while the member types, delayed so a word is not a request per
  // keystroke. `searchTerm` is what the answer belongs to, which is what keeps
  // "no results" from being drawn under a newer term.
  useEffect(() => {
    if (isLoading || !user) return;
    const delay = firstSearch.current ? 0 : 300;
    firstSearch.current = false;
    const timer = setTimeout(() => void runSearch(query.trim(), null, false), delay);
    return () => clearTimeout(timer);
  }, [isLoading, user, query, runSearch]);

  const onConnect = async (server: McpCatalogRow, key?: string) => {
    setConnectingTo(server.registryName);
    setActionError(null);
    try {
      const started = key
        ? await startMcpConnection(server.registryName, { apiKey: key })
        : await startMcpConnection(server.registryName);
      setConsentFor(null);
      setApiKey('');
      setKeyError(null);
      if (started.kind === 'connected') {
        // No consent screen to visit: the server made the connection, and the
        // screen that explains it is the one the member lands on (decision 9).
        router.push(`/mcp/apps/${encodeURIComponent(started.connectionId)}?connect=done`);
        return;
      }
      // The consent page is a third party's origin; the whole document leaves.
      window.location.assign(started.authorizeUrl);
    } catch (error) {
      const sentence = error instanceof Error ? error.message : MCP_STORE_COPY.connectFailed;
      if (key) setKeyError(sentence);
      else setActionError(sentence);
      setConnectingTo(null);
    }
  };

  if (isLoading) return <LoadingBlocks />;

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-6 text-center">
        <p className="max-w-sm text-sm leading-relaxed text-balance text-muted-foreground">
          {MCP_STORE_COPY.signInBody}
        </p>
        <SignInCta href="/auth/login?redirect=/mcp/apps" visual="marketplace-cta">
          {MCP_STORE_COPY.signIn}
        </SignInCta>
      </div>
    );
  }

  /*
    A search over a list that is already drawn is a refresh, so the rows are
    dimmed while it runs: the reader sees the old answer and the sentence agree,
    instead of a result that looks untouched. The seed from the cache is the
    same term, so a revalidation on open does not dim it.
  */
  const dimmed = searching && searchTerm !== query.trim();

  return (
    <div data-visual="store-panel" className="space-y-8">
      <ConnectOutcome connect={connect} />

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
        >
          {actionError}
        </p>
      )}

      <section
        data-visual="store-connections"
        aria-labelledby="mcp-connections-title"
        className="space-y-3"
      >
        <h2
          id="mcp-connections-title"
          data-visual="store-connections-title"
          className="max-sm:text-base font-extrabold text-foreground sm:text-lg"
        >
          {MCP_STORE_COPY.connectionsTitle}
        </h2>

        {connectionsFailed ? (
          connectionsOffline ? (
            <NeedsConnection
              message={MCP_STORE_COPY.connectionsOffline}
              onRetry={() => void loadConnections()}
            />
          ) : (
            <FailureRow
              message={MCP_STORE_COPY.connectionsFailed}
              onRetry={() => void loadConnections()}
            />
          )
        ) : connections === null ? (
          <LoadingBlocks rows={1} />
        ) : connections.length === 0 ? (
          <EmptyCard
            title={MCP_STORE_COPY.connectionsEmptyTitle}
            body={MCP_STORE_COPY.connectionsEmptyBody}
          />
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

      <section aria-label={MCP_STORE_COPY.searchLabel} className="space-y-3">
        {searchFailed ? (
          searchOffline ? (
            <NeedsConnection
              message={MCP_STORE_COPY.searchOffline}
              onRetry={() => void runSearch(query.trim(), null, false)}
            />
          ) : (
            <FailureRow
              message={MCP_STORE_COPY.searchFailed}
              onRetry={() => void runSearch(query.trim(), null, false)}
            />
          )
        ) : servers === null ? (
          <LoadingBlocks rows={2} />
        ) : servers.length === 0 ? (
          <EmptyCard
            title={query.trim() ? MCP_STORE_COPY.searchEmptyTitle : MCP_STORE_COPY.storeEmptyTitle}
            body={query.trim() ? MCP_STORE_COPY.searchEmptyBody : MCP_STORE_COPY.storeEmptyBody}
          />
        ) : (
          <div aria-busy={searching} className="space-y-2.5">
            <ul
              className={`space-y-2.5 transition-opacity duration-150 ease-out ${
                dimmed ? 'opacity-60' : 'opacity-100'
              }`}
            >
              {servers.map((server) => (
                <li key={server.registryName}>
                  <CatalogueRow
                    server={server}
                    connection={connectionByRegistry.get(server.registryName) ?? null}
                    connecting={connectingTo === server.registryName}
                    disabled={connectingTo !== null}
                    onConnect={() => {
                      setApiKey('');
                      setKeyError(null);
                      setConsentFor(server);
                    }}
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
                <span>{MCP_STORE_COPY.more}</span>
              </button>
            )}
          </div>
        )}

        {searching && servers !== null && (
          <p role="status" aria-live="polite" className="text-center text-xs text-muted-foreground">
            {query.trim() ? MCP_STORE_COPY.searchLoading : MCP_STORE_COPY.searchRefreshing}
          </p>
        )}
      </section>

      {/**
       * What we are about to ask for, in Arabic, before the document leaves for
       * the provider's own (English) consent screen. The ask is code, not a
       * guess: it rides the catalogue row (`requestedScopes`), and an empty set
       * is drawn as "the app decides" rather than as a promise we cannot keep.
       *
       * A row that needs no account, or a key (#1269), gets the same dialog with
       * its own body: nothing leaves the site in either case.
       */}
      <ConfirmDialog
        open={consentFor !== null}
        title={
          consentFor?.authMode === 'api_key'
            ? MCP_STORE_COPY.keyTitle.replace('{name}', consentFor.title ?? consentFor.registryName)
            : consentFor?.authMode === 'none'
              ? MCP_STORE_COPY.noAuthTitle.replace(
                  '{name}',
                  consentFor.title ?? consentFor.registryName
                )
              : MCP_STORE_COPY.consentTitle.replace(
                  '{name}',
                  consentFor?.title ?? consentFor?.registryName ?? ''
                )
        }
        message={
          consentFor?.authMode === 'api_key' ? (
            <span className="block space-y-2 text-start">
              <span className="block">{MCP_STORE_COPY.keyBody}</span>
              <label className="mt-3 block space-y-1">
                <span className="block text-xs font-bold text-foreground">
                  {MCP_STORE_COPY.keyLabel}
                </span>
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  placeholder={MCP_STORE_COPY.keyPlaceholder}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setKeyError(null);
                  }}
                  className="w-full rounded-xl border border-border/60 bg-card px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                />
              </label>
              {keyError && (
                <span role="alert" className="block text-xs font-bold text-destructive">
                  {keyError}
                </span>
              )}
            </span>
          ) : consentFor?.authMode === 'none' ? (
            <span className="block">{MCP_STORE_COPY.noAuthBody}</span>
          ) : consentFor && consentFor.requestedScopes.length > 0 ? (
            <>
              <span className="block">{MCP_STORE_COPY.consentAsk}</span>
              <span dir="ltr" className="mt-2 block font-mono text-xs leading-relaxed">
                {consentFor.requestedScopes.join(' · ')}
              </span>
              <span className="mt-2 block">{MCP_STORE_COPY.consentNote}</span>
            </>
          ) : (
            <span className="block">{MCP_STORE_COPY.consentDefault}</span>
          )
        }
        confirmLabel={
          consentFor?.authMode === 'oauth' ? MCP_STORE_COPY.consentContinue : MCP_STORE_COPY.connect
        }
        cancelLabel={MCP_STORE_COPY.cancel}
        icon={Plug}
        variant="default"
        isConfirming={connectingTo !== null}
        onConfirm={() => {
          if (!consentFor) return;
          if (consentFor.authMode === 'api_key') {
            const key = apiKey.trim();
            if (key.length === 0) {
              setKeyError(MCP_STORE_COPY.keyRequired);
              return;
            }
            void onConnect(consentFor, key);
            return;
          }
          void onConnect(consentFor);
        }}
        onCancel={() => {
          if (connectingTo === null) {
            setConsentFor(null);
            setApiKey('');
            setKeyError(null);
          }
        }}
      />
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
    denied: MCP_STORE_COPY.connectDenied,
    invalid: MCP_STORE_COPY.connectInvalid,
    signin: MCP_STORE_COPY.connectSignin,
    blocked: MCP_STORE_COPY.connectBlocked,
    plan_limit: MCP_STORE_COPY.connectPlanLimit,
  };
  const sentence = sentences[connect] ?? MCP_STORE_COPY.connectError;

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
          <p className="truncate max-sm:text-sm font-bold text-foreground sm:text-base">{name}</p>
          <p className="text-xs text-muted-foreground">
            <span>{MCP_STORE_COPY.toolCount.replace('{count}', String(connection.toolCount))}</span>
            <span aria-hidden="true"> · </span>
            <span>
              {MCP_STORE_COPY.lastUsed}{' '}
              {connection.lastUsedAt
                ? formatHijriDate(connection.lastUsedAt)
                : MCP_STORE_COPY.neverUsed}
            </span>
          </p>
          <ConnectionBadges connection={connection} />
        </div>
      </div>

      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 max-sm:text-xs font-bold text-foreground sm:text-sm">
        {MCP_STORE_COPY.manage}
      </span>
    </Link>
  );
}

/** The state of a connection, in one line: the list and the catalogue row draw it alike. */
function ConnectionBadges({ connection }: { connection: McpConnection }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs">
      <ConnectionStatusBadge status={connection.status} />
      <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 font-bold text-muted-foreground">
        {permissionLabel(connection.permissionLevel)}
      </span>
      {!connection.enabled && (
        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-300">
          {MCP_STORE_COPY.connectionDisabled}
        </span>
      )}
    </p>
  );
}

function ConnectionStatusBadge({ status }: { status: McpConnection['status'] }) {
  if (status === 'needs_reauth') {
    return (
      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-bold text-amber-600 dark:text-amber-300">
        {MCP_STORE_COPY.statusNeedsReauth}
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="rounded-full border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-bold text-destructive">
        {MCP_STORE_COPY.statusError}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-bold text-primary">
      {MCP_STORE_COPY.statusActive}
    </span>
  );
}

/**
 * One catalogue row: the server's mark, its own name, its description, and the
 * way in.
 *
 * Only a verified, connectable row reaches this screen, so the row does not
 * explain why it cannot be linked: there is nothing here that cannot. The mark
 * is proxied by us (`/mcp/icon`) and a missing one is a monogram, never a hole.
 *
 * A server the member already connected is not offered a second crossing: the
 * row shows the connection's own state and links to its screen. The connect
 * flow would only re-consent and reuse the slot, but a «ربط» on a linked app
 * reads as if nothing had happened yet.
 */
function CatalogueRow({
  server,
  connection,
  connecting,
  disabled,
  onConnect,
}: {
  server: McpCatalogRow;
  connection: McpConnection | null;
  connecting: boolean;
  disabled: boolean;
  onConnect: () => void;
}) {
  const name = server.title ?? server.registryName;

  return (
    <div
      data-visual="store-row"
      className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <CatalogueMark server={server} />
        <div className="min-w-0 space-y-1">
          <p className="flex min-w-0 items-center gap-1.5 max-sm:text-sm font-bold text-foreground sm:text-base">
            <span className="truncate">{name}</span>
            <BadgeCheck
              role="img"
              aria-label={MCP_STORE_COPY.verifiedBadge}
              data-visual="store-verified"
              className="h-4 w-4 shrink-0 text-primary"
            />
            {server.nameAr && (
              <span className="truncate text-xs font-medium text-muted-foreground">
                {server.nameAr}
              </span>
            )}
            {server.authMode !== 'oauth' && (
              // What the row needs, before the tap (#1269): a key or nothing at
              // all is a different decision for the member than a consent page.
              <span
                className={
                  server.authMode === 'api_key'
                    ? 'shrink-0 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300'
                    : 'shrink-0 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-bold text-muted-foreground'
                }
              >
                {server.authMode === 'api_key'
                  ? MCP_STORE_COPY.authBadgeApiKey
                  : MCP_STORE_COPY.authBadgeNone}
              </span>
            )}
          </p>
          {server.description && (
            <p dir="auto" className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {server.description}
            </p>
          )}
          {connection && <ConnectionBadges connection={connection} />}
        </div>
      </div>

      {connection ? (
        <Link
          href={`/mcp/apps/${encodeURIComponent(connection.id)}`}
          aria-label={`${MCP_STORE_COPY.manage} ${name}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border/60 bg-card/60 px-3 py-2 max-sm:text-xs font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-sm"
        >
          {MCP_STORE_COPY.manage}
        </Link>
      ) : (
        <button
          type="button"
          data-visual="store-connect"
          onClick={onConnect}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 max-sm:text-xs font-bold text-primary transition-safe duration-150 ease-out hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 sm:text-sm"
        >
          {connecting ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Plus aria-hidden="true" className="h-4 w-4" />
          )}
          <span>{connecting ? MCP_STORE_COPY.connecting : MCP_STORE_COPY.connect}</span>
        </button>
      )}
    </div>
  );
}

/** The row's brand mark, or the first letter of its name when it has none. */
function CatalogueMark({ server }: { server: McpCatalogRow }) {
  const name = server.title ?? server.registryName;
  const [failed, setFailed] = useState(false);

  if (!server.iconUrl || failed) {
    return (
      <span
        aria-hidden="true"
        data-visual="store-mark"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/50 text-sm font-extrabold text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      // A mark we ship (`/brand/mcp/...`) is same-origin and served as it is;
      // anything else is a third party's URL, and the member's browser only ever
      // talks to our proxy for it.
      src={
        server.iconUrl.startsWith('/')
          ? server.iconUrl
          : `/mcp/icon?name=${encodeURIComponent(server.registryName)}`
      }
      alt=""
      width={40}
      height={40}
      unoptimized
      data-visual="store-mark"
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-xl border border-border/50 bg-background object-contain p-1"
    />
  );
}

export function permissionLabel(level: McpPermissionLevel): string {
  switch (level) {
    case 'reads':
      return MCP_STORE_COPY.permissionReads;
    case 'all':
      return MCP_STORE_COPY.permissionAll;
    case 'ask':
      return MCP_STORE_COPY.permissionAsk;
  }
}

function LoadingBlocks({ rows = 2 }: { rows?: number }) {
  const blocks = useMemo(() => Array.from({ length: rows }, (_, index) => index), [rows]);

  return (
    <div className="space-y-2.5" aria-busy="true" aria-label={MCP_STORE_COPY.loadingLabel}>
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
        <span>{MCP_STORE_COPY.retry}</span>
      </button>
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-visual="store-empty"
      className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/60 p-6 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
        <Unplug aria-hidden="true" size={22} />
      </div>
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="max-sm:text-xs text-muted-foreground sm:text-sm">{body}</p>
    </div>
  );
}
