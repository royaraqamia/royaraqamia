'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, Loader2, PackageSearch, PencilLine, Search } from 'lucide-react';
import { toast } from 'sonner';

import { getAdminMcpCatalog, updateAdminMcpCatalogRow } from '@/frontend/api/mcp-catalog';
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

type RowActionMode = 'block' | 'unblock' | 'arabic';

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
                  {row.blocked && <Badge variant="destructive">{COPY.blockedBadge}</Badge>}
                  {row.status === 'deprecated' && (
                    <Badge variant="warning">{COPY.deprecatedBadge}</Badge>
                  )}
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

              {row.description && (
                <p className="mt-2 text-sm text-muted-foreground text-pretty">{row.description}</p>
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
                {row.remoteUrl}
              </p>
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
        </DialogContent>
      </Dialog>
    </div>
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
  const [nameAr, setNameAr] = useState(row.nameAr ?? '');
  const [descriptionAr, setDescriptionAr] = useState(row.descriptionAr ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateAdminMcpCatalogRow({
        registryName: row.registryName,
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
