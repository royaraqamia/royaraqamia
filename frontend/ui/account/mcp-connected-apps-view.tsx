'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plug, Plus, RefreshCw, Unplug } from 'lucide-react';

import type { McpConnectedApp } from '@/shared/contracts/mcp-connected-apps';
import {
  disconnectAllMcpConnectedApps,
  disconnectMcpConnectedApp,
  getMcpConnectedApps,
} from '@/frontend/api/mcp-connected-apps';
import { calculateTimeAgo, formatHijriDate } from '@/frontend/shared/format';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { ApiError } from '@/frontend/transport/http';

/**
 * The MCP clients connected to the signed-in account.
 *
 * The list is read from the server rather than filtered locally, because the
 * server is the record of what is still live: a revocation that half-succeeded
 * must not look complete because the client removed the row optimistically.
 */
export function McpConnectedAppsView() {
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
    void load();
  }, [load]);

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
      setActionError(result.error ?? 'تعذّر فصل التَّطبيق.');
      return;
    }

    await load();
  };

  if (loadFailed) {
    if (loadOffline) {
      return (
        <NeedsConnection
          message="تعذّر تحميل التَّطبيقات المتَّصلة: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
          onRetry={() => void load()}
        />
      );
    }

    return (
      <div className="space-y-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm font-bold text-destructive sm:text-base">
          تعذّر تحميل التَّطبيقات المتَّصلة.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  if (connectedApps === null) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="جاري التَّحميل...">
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
                      {connectedApp.clientName ?? 'تطبيق MCP'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span>
                        آخر استخدام:{' '}
                        {connectedApp.lastUsedAt
                          ? calculateTimeAgo(connectedApp.lastUsedAt)
                          : 'لم يُستخدم بعد'}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>متَّصل منذ {formatHijriDate(connectedApp.connectedAt)}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTarget(connectedApp)}
                  aria-label={`فصل ${connectedApp.clientName ?? 'تطبيق MCP'}`}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs font-bold text-destructive/90 transition-safe duration-150 ease-out hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 sm:text-sm"
                >
                  <Unplug aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>فصل</span>
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
            <span>فصل كل التَّطبيقات</span>
          </button>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
            <Plug aria-hidden="true" size={24} />
          </div>
          <div className="space-y-1">
            <p className="text-base font-bold text-foreground sm:text-lg">
              لا توجد تطبيقات متَّصلة
            </p>
            <p className="text-xs text-muted-foreground sm:text-sm">
              اربط وكيل برمجة — Claude Code أو OpenCode أو Codex — لتصل أدواته إلى بياناتك.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/mcp/guide"
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-sm font-bold text-foreground transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <Plus aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span>ربط تطبيق جديد</span>
      </Link>

      <ConfirmDialog
        open={target !== null}
        title={target === 'all' ? 'فصل كل التَّطبيقات' : 'فصل التَّطبيق'}
        message={
          target === 'all'
            ? 'هل تريد فصل جميع التَّطبيقات المتَّصلة؟ ستحتاج إلى إعادة ربط أيِّ تطبيق تريد استخدامه من جديد، وبقاؤك مسجَّلًا في الموقع لن يتأثَّر.'
            : `هل تريد فصل «${
                target?.clientName ?? 'تطبيق MCP'
              }»؟ لن يستطيع الوصول إلى بياناتك بعد الآن، وبقاؤك مسجَّلًا في الموقع لن يتأثَّر.`
        }
        confirmLabel={target === 'all' ? 'فصل الكل' : 'فصل'}
        cancelLabel="إلغاء"
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
