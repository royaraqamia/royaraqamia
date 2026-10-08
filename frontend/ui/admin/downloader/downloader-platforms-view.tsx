'use client';

import { Power } from 'lucide-react';
import { Badge } from '@/frontend/ui/primitives/badge';
import { Button } from '@/frontend/ui/primitives/button';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { formatHijriDate } from '@/frontend/shared/format';
import { useAdminDownloadPlatforms } from '@/frontend/state/downloader/use-admin-downloader';

export function DownloaderPlatformsView() {
  const { platforms, loading, error, busyId, toggle } = useAdminDownloadPlatforms();

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="جاري تحميل المنصّات">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="rounded-2xl border border-border/60 bg-card p-4">
            <Skeleton className="mb-2 h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {platforms.map((platform) => {
        const busy = busyId === platform.id;

        return (
          <div key={platform.id} className="border-border/60 bg-card rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-foreground">{platform.name}</h2>
                <p dir="ltr" className="mt-0.5 truncate text-xs text-muted-foreground">
                  {platform.domains.join(', ')}
                </p>
              </div>

              <Button
                variant={platform.enabled ? 'outline' : 'default'}
                size="sm"
                disabled={busy}
                onClick={() => toggle(platform.id, !platform.enabled)}
              >
                <Power className="size-4" aria-hidden="true" />
                {platform.enabled ? 'تعطيل' : 'تفعيل'}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant={platform.enabled ? 'success' : 'secondary'} size="sm">
                {platform.enabled ? 'مفعّلة' : 'معطّلة'}
              </Badge>
              {platform.breakerOpen && (
                <Badge variant="destructive" size="sm">
                  قاطع مفتوح
                </Badge>
              )}
              {platform.consecutiveFailures > 0 && (
                <Badge variant="warning" size="sm">
                  {platform.consecutiveFailures} إخفاق
                </Badge>
              )}
            </div>

            {platform.breakerOpen && platform.openUntil && (
              <p className="mt-2 text-xs text-muted-foreground">
                يُفتح مجددًا في {formatHijriDate(platform.openUntil)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
