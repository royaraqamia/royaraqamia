'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  BadgeCheck,
  Ban,
  Link2,
  Loader2,
  PackageSearch,
  PencilLine,
  RefreshCw,
  Search,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  getAdminMcpCatalog,
  probeAdminMcpCatalogRow,
  updateAdminMcpCatalogRow,
} from '@/frontend/api/mcp-catalog';
import { AdminPageHeader } from '@/frontend/ui/admin/admin-page-header';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Input } from '@/frontend/ui/primitives/input';
import { Label } from '@/frontend/ui/primitives/label';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { cn } from '@/frontend/shared/cn';
import {
  MCP_CATALOG_ADMIN_COPY as COPY,
  type McpCatalogAdminRow,
} from '@/shared/contracts/mcp-catalog';

/**
 * The catalogue's takedown list (ADR-0155, phase 2 / #1223).
 *
 * The marketplace has no approval queue: every active row the registry serves is
 * in the store, and the one act a human must be able to perform without a deploy
 * is taking one out — with a reason, because the reason is what the member who
 * tries to connect reads. The same screen is where the Arabic an admin writes
 * replaces the registry's English.
 */

type RowActionMode = 'block' | 'unblock' | 'arabic' | 'verify' | 'remote';

interface RowAction {
  row: McpCatalogAdminRow;
  mode: RowActionMode;
}

export function McpCatalogAdminView() {
  const [rows, setRows] = useState<McpCatalogAdminRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<RowAction | null>(null);
  const [probing, setProbing] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdminMcpCatalog({ q, cursor: null })
      .then((page) => {
        if (cancelled) return;
        setRows(page.servers);
        setCursor(page.nextCursor);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : COPY.loadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, revision]);

  const reload = useCallback(() => setRevision((current) => current + 1), []);

  async function probe(registryName: string) {
    setProbing(registryName);
    try {
      await probeAdminMcpCatalogRow(registryName);
      toast.success(COPY.probeDone);
      reload();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.probeFailed);
    } finally {
      setProbing(null);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await getAdminMcpCatalog({ q, cursor });
      setRows((current) => [...current, ...page.servers]);
      setCursor(page.nextCursor);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.loadFailed);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader title={COPY.title} />

      <p className="mx-auto max-w-2xl text-center text-sm text-muted-foreground text-pretty">
        {COPY.description}
      </p>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQ(searchInput.trim());
        }}
      >
        <Input
          type="search"
          placeholder={COPY.searchPlaceholder}
          aria-label={COPY.searchLabel}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <Button type="submit" variant="outline" size="sm">
          <Search className="size-4" aria-hidden="true" />
          {COPY.searchAction}
        </Button>
      </form>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label={COPY.loading}>
          {[0, 1, 2].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState icon={PackageSearch} title={COPY.empty} description={COPY.emptyDescription} />
      )}

      {!loading && !error && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.registryName} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground" dir="ltr">
                    {row.title ?? row.registryName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground" dir="ltr">
                    {row.registryName}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant={connectableVariant(row)}>{connectableLabel(row)}</Badge>
                  {row.verifiedAt && <Badge variant="success">{COPY.verifiedBadge}</Badge>}
                  {row.registrationKind === 'static' && (
                    <Badge variant="secondary">{COPY.staticClientBadge}</Badge>
                  )}
                  {row.featuredRank !== null && (
                    <Badge variant="secondary">
                      {COPY.featuredRankBadge} {row.featuredRank}
                    </Badge>
                  )}
                  {row.blocked && <Badge variant="destructive">{COPY.blockedBadge}</Badge>}
                  {row.status === 'deprecated' && (
                    <Badge variant="warning">{COPY.deprecatedBadge}</Badge>
                  )}
                  {(!row.verifiedAt || row.connectable === null) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void probe(row.registryName)}
                      disabled={probing !== null}
                    >
                      {probing === row.registryName ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="size-4" aria-hidden="true" />
                      )}
                      {COPY.probeAction}
                    </Button>
                  )}
                  <Button
                    variant={row.verifiedAt ? 'outline' : 'default'}
                    size="sm"
                    disabled={!row.verifiedAt && row.connectable !== true}
                    title={
                      !row.verifiedAt && row.connectable !== true
                        ? COPY.verifyNeedsConnectable
                        : undefined
                    }
                    onClick={() => setAction({ row, mode: 'verify' })}
                  >
                    {row.verifiedAt ? (
                      <ShieldOff className="size-4" aria-hidden="true" />
                    ) : (
                      <BadgeCheck className="size-4" aria-hidden="true" />
                    )}
                    {row.verifiedAt ? COPY.manageVerifiedAction : COPY.verifyAction}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ row, mode: 'remote' })}
                  >
                    <Link2 className="size-4" aria-hidden="true" />
                    {COPY.remoteAction}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAction({ row, mode: 'arabic' })}
                  >
                    <PencilLine className="size-4" aria-hidden="true" />
                    {COPY.arabicAction}
                  </Button>
                  <Button
                    variant={row.blocked ? 'outline' : 'destructive'}
                    size="sm"
                    onClick={() => setAction({ row, mode: row.blocked ? 'unblock' : 'block' })}
                  >
                    <Ban className="size-4" aria-hidden="true" />
                    {row.blocked ? COPY.unblockAction : COPY.blockAction}
                  </Button>
                </div>
              </div>

              <div className="mt-2 flex items-start gap-3">
                <CatalogueMark row={row} />
                <div className="min-w-0 flex-1">
                  {row.description && (
                    <p className="text-sm text-muted-foreground text-pretty">{row.description}</p>
                  )}

                  {row.connectable === false && row.connectableReason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {COPY.reasonLabels[row.connectableReason]}
                    </p>
                  )}

                  {row.blocked && row.blockedReason && (
                    <p className="mt-1 text-xs text-destructive">{row.blockedReason}</p>
                  )}

                  <p className="mt-2 truncate text-xs text-muted-foreground" dir="ltr">
                    {row.remoteOverride ?? row.remoteUrl}
                  </p>
                  {row.remoteOverride && (
                    <p className="truncate text-xs text-muted-foreground/70" dir="ltr">
                      {row.remoteUrl}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && !error && cursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {COPY.more}
          </Button>
        </div>
      )}

      <Dialog
        open={action !== null}
        onOpenChange={(next) => {
          if (!next) setAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {action?.mode === 'block' && (
            <BlockForm
              row={action.row}
              onCancel={() => setAction(null)}
              onDone={() => {
                setAction(null);
                reload();
              }}
            />
          )}
          {action?.mode === 'unblock' && (
            <UnblockForm
              row={action.row}
              onCancel={() => setAction(null)}
              onDone={() => {
                setAction(null);
                reload();
              }}
            />
          )}
          {action?.mode === 'arabic' && (
            <ArabicForm
              row={action.row}
              onCancel={() => setAction(null)}
              onDone={() => {
                setAction(null);
                reload();
              }}
            />
          )}
          {action?.mode === 'remote' && (
            <RemoteForm
              row={action.row}
              onCancel={() => setAction(null)}
              onDone={() => {
                setAction(null);
                reload();
              }}
            />
          )}
          {action?.mode === 'verify' && (
            <VerifyForm
              row={action.row}
              onCancel={() => setAction(null)}
              onDone={() => {
                setAction(null);
                reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The row's mark, proxied by us; a monogram when the registry and the probe both had none. */
function CatalogueMark({ row }: { row: McpCatalogAdminRow }) {
  const name = row.title ?? row.registryName;
  const [failed, setFailed] = useState(false);

  if (!row.iconUrl || failed) {
    return (
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/50 text-sm font-extrabold text-muted-foreground"
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={`/mcp/icon?name=${encodeURIComponent(row.registryName)}`}
      alt=""
      width={40}
      height={40}
      unoptimized
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-xl border border-border/50 bg-background object-contain p-1"
    />
  );
}

function connectableLabel(row: McpCatalogAdminRow): string {
  if (row.connectable === true) return COPY.connectableYes;
  if (row.connectable === false) return COPY.connectableNo;
  return COPY.connectableUnknown;
}

function connectableVariant(row: McpCatalogAdminRow): 'success' | 'destructive' | 'secondary' {
  if (row.connectable === true) return 'success';
  if (row.connectable === false) return 'destructive';
  return 'secondary';
}

interface FormProps {
  row: McpCatalogAdminRow;
  onCancel: () => void;
  onDone: () => void;
}

function BlockForm({ row, onCancel, onDone }: FormProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateAdminMcpCatalogRow({
        registryName: row.registryName,
        blocked: true,
        blockedReason: reason.trim(),
      });
      toast.success(COPY.saved);
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogTitle className="leading-snug!">{COPY.blockTitle}</DialogTitle>
      <DialogDescription className="text-pretty">{COPY.blockDescription}</DialogDescription>
      <div className="space-y-2">
        <Label htmlFor="mcp-block-reason">{COPY.blockReasonLabel}</Label>
        <Textarea
          id="mcp-block-reason"
          value={reason}
          maxLength={500}
          rows={3}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {COPY.cancel}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => void save()}
          disabled={saving || reason.trim().length === 0}
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {COPY.blockAction}
        </Button>
      </div>
    </>
  );
}

function UnblockForm({ row, onCancel, onDone }: FormProps) {
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateAdminMcpCatalogRow({ registryName: row.registryName, blocked: false });
      toast.success(COPY.saved);
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogTitle className="leading-snug!">{COPY.unblockTitle}</DialogTitle>
      <DialogDescription className="text-pretty">{COPY.unblockDescription}</DialogDescription>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {COPY.cancel}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {COPY.unblockAction}
        </Button>
      </div>
    </>
  );
}

function ArabicForm({ row, onCancel, onDone }: FormProps) {
  const [titleOverride, setTitleOverride] = useState(row.titleOverride ?? '');
  const [nameAr, setNameAr] = useState(row.nameAr ?? '');
  const [descriptionAr, setDescriptionAr] = useState(row.descriptionAr ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateAdminMcpCatalogRow({
        registryName: row.registryName,
        titleOverride: titleOverride.trim(),
        nameAr: nameAr.trim(),
        descriptionAr: descriptionAr.trim(),
      });
      toast.success(COPY.saved);
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogTitle className="leading-snug!">{COPY.arabicTitle}</DialogTitle>
      <DialogDescription className="text-pretty">{COPY.arabicDescription}</DialogDescription>
      <div className="space-y-2">
        <Label htmlFor="mcp-title-override">{COPY.nameEnLabel}</Label>
        <Input
          id="mcp-title-override"
          value={titleOverride}
          maxLength={120}
          dir="ltr"
          placeholder={row.registryName}
          onChange={(event) => setTitleOverride(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mcp-name-ar">{COPY.nameArLabel}</Label>
        <Input
          id="mcp-name-ar"
          value={nameAr}
          maxLength={120}
          onChange={(event) => setNameAr(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="mcp-description-ar">{COPY.descriptionArLabel}</Label>
        <Textarea
          id="mcp-description-ar"
          value={descriptionAr}
          maxLength={1000}
          rows={4}
          onChange={(event) => setDescriptionAr(event.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {COPY.cancel}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {COPY.save}
        </Button>
      </div>
    </>
  );
}

/**
 * The remote, from the registry's own list or typed.
 *
 * The registry publishes one or more `remotes[]` per server and the mirror keeps
 * only the first `streamable-http` entry the egress policy accepts. That first
 * entry is often a docs server that publishes no RFC 9728 document, while an
 * account server beside it does — which is why this choice exists. Saving a
 * different address clears the verdict, because the address is what was
 * measured; the row then says «لم نتحقق بعد» until «فحص الآن» runs.
 */
function RemoteForm({ row, onCancel, onDone }: FormProps) {
  const [url, setUrl] = useState(row.remoteOverride ?? row.remoteUrl);
  const [saving, setSaving] = useState(false);

  /*
    The registry's own address is stored as no override at all, so a later change
    to it is followed rather than pinned to a stale copy of it.
  */
  function override(): string | null {
    const next = url.trim();
    return next === '' || next === row.remoteUrl ? null : next;
  }

  async function save() {
    setSaving(true);
    try {
      await updateAdminMcpCatalogRow({
        registryName: row.registryName,
        remoteOverride: override(),
      });
      toast.success(COPY.saved);
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  const selected = override();

  return (
    <>
      <DialogTitle className="leading-snug!">{COPY.remoteTitle}</DialogTitle>
      <DialogDescription className="text-pretty">{COPY.remoteDescription}</DialogDescription>

      <div className="space-y-2">
        <Label htmlFor="mcp-remote-url">{COPY.remoteUrlLabel}</Label>
        <Input
          id="mcp-remote-url"
          value={url}
          maxLength={2048}
          dir="ltr"
          placeholder={row.remoteUrl}
          onChange={(event) => setUrl(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{COPY.remoteUrlHint}</p>
      </div>

      {row.remoteOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{COPY.remoteOptionsLabel}</p>
          <ul className="space-y-1">
            {row.remoteOptions.map((option) => {
              const chosen = (selected ?? row.remoteUrl) === option.url;
              return (
                <li key={`${option.type}:${option.url}`}>
                  <button
                    type="button"
                    onClick={() => setUrl(option.url)}
                    aria-pressed={chosen}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-start text-xs transition-colors',
                      chosen
                        ? 'border-primary/60 bg-primary/10'
                        : 'border-border/60 hover:bg-muted/50'
                    )}
                  >
                    <span className="shrink-0 text-muted-foreground" dir="ltr">
                      {option.type}
                    </span>
                    <span className="truncate" dir="ltr">
                      {option.url}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">{COPY.remoteRegistryHint}</p>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          {COPY.cancel}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {COPY.save}
        </Button>
      </div>
    </>
  );
}

/**
 * The store's admission, in one dialog: approve a measured row, adjust its place,
 * or take the vouch back. The rank is the store's order, not a score, and it is
 * optional — a row without one follows the featured ones.
 */
function VerifyForm({ row, onCancel, onDone }: FormProps) {
  const verified = row.verifiedAt !== null;
  const [rank, setRank] = useState(row.featuredRank === null ? '' : String(row.featuredRank));
  const [saving, setSaving] = useState<'save' | 'unverify' | null>(null);

  function featuredRank(): number | null {
    if (rank.trim() === '') return null;
    const parsed = Number(rank);
    return Number.isInteger(parsed) ? parsed : null;
  }

  async function submit(nextVerified: boolean) {
    setSaving(nextVerified ? 'save' : 'unverify');
    try {
      await updateAdminMcpCatalogRow({
        registryName: row.registryName,
        verified: nextVerified,
        ...(nextVerified ? { featuredRank: featuredRank() } : {}),
      });
      toast.success(COPY.saved);
      onDone();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : COPY.saveFailed);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <DialogTitle className="leading-snug!">
        {verified ? COPY.manageVerifiedAction : COPY.verifyTitle}
      </DialogTitle>
      <DialogDescription className="text-pretty">
        {verified ? COPY.manageVerifiedDescription : COPY.verifyDescription}
      </DialogDescription>

      <div className="space-y-2">
        <Label htmlFor="mcp-featured-rank">{COPY.featuredRankLabel}</Label>
        <Input
          id="mcp-featured-rank"
          type="number"
          min={0}
          max={999999}
          inputMode="numeric"
          value={rank}
          onChange={(event) => setRank(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{COPY.featuredRankHint}</p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving !== null}>
          {COPY.cancel}
        </Button>
        {verified && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => void submit(false)}
            disabled={saving !== null}
          >
            {saving === 'unverify' && (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            )}
            {COPY.unverifyAction}
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void submit(true)}
          disabled={saving !== null || (!verified && row.connectable !== true)}
        >
          {saving === 'save' && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {verified ? COPY.save : COPY.verifyAction}
        </Button>
      </div>
    </>
  );
}
