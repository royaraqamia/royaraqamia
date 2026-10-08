'use client';

import { useState, type FormEvent } from 'react';
import { Ban, Trash2 } from 'lucide-react';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import {
  DOWNLOAD_BLOCK_KINDS,
  DOWNLOAD_BLOCK_KIND_LABELS,
  type DownloadBlockKind,
} from '@/shared/contracts/downloader';
import { useAdminDownloadBlocklist } from '@/frontend/state/downloader/use-admin-downloader';

export function DownloaderBlocklistView() {
  const { entries, loading, error, busy, add, remove } = useAdminDownloadBlocklist();
  const [kind, setKind] = useState<DownloadBlockKind>('domain');
  const [value, setValue] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    const added = await add(kind, trimmed);
    if (added) setValue('');
  }

  return (
    <div className="space-y-5">
      <form
        className="border-border/60 bg-card flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-end"
        onSubmit={handleSubmit}
      >
        <div className="w-full sm:w-40">
          <label htmlFor="block-kind" className="form-label text-xs text-muted-foreground">
            النَّوع
          </label>
          <Select value={kind} onValueChange={(next) => setKind(next as DownloadBlockKind)}>
            <SelectTrigger id="block-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOWNLOAD_BLOCK_KINDS.map((option) => (
                <SelectItem key={option} value={option}>
                  {DOWNLOAD_BLOCK_KIND_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label htmlFor="block-value" className="form-label text-xs text-muted-foreground">
            {kind === 'domain' ? 'النِّطاق' : 'الرَّابط'}
          </label>
          <Input
            id="block-value"
            dir="ltr"
            placeholder={kind === 'domain' ? 'example.com' : 'https://example.com/a'}
            value={value}
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={busy || value.trim().length === 0} className="sm:w-auto">
          <Ban className="size-4" aria-hidden="true" />
          حظر
        </Button>
      </form>

      {loading && (
        <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل قائمة الحظر">
          {[0, 1].map((key) => (
            <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {!loading && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {!loading && !error && entries.length === 0 && (
        <EmptyState
          icon={Ban}
          title="قائمة الحظر فارغة"
          description="أضف نطاقًا أو رابطًا لرفضه على صفحة مُنزِّل الوسائط."
        />
      )}

      {!loading && !error && entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-border/60 bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Badge variant={entry.kind === 'domain' ? 'info' : 'secondary'} size="sm">
                  {DOWNLOAD_BLOCK_KIND_LABELS[entry.kind]}
                </Badge>
                <span dir="ltr" className="truncate font-mono text-xs text-foreground">
                  {entry.value}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`إزالة حظر ${entry.value}`}
                onClick={() => remove(entry.id)}
              >
                <Trash2 className="size-4 text-destructive" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
