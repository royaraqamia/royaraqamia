'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';

import type { AgentGrantableTool, AgentToolGrant } from '@/shared/contracts/agent-tool-grants';
import {
  getAgentToolGrants,
  grantAgentTool,
  revokeAgentTool,
} from '@/frontend/api/agent-tool-grants';
import { formatHijriDate } from '@/frontend/shared/format';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { useSession } from '@/frontend/state/session-provider';

const GRANTS_COPY = {
  title: 'أذون المساعد',
  body: 'الأدوات التي سمحت لها بالعمل دون تأكيد في كل مرة. يمكنك سحب أي إذن في أي وقت.',
  loading: 'جاري تحميل الأذون...',
  failed: 'تعذّر تحميل الأذون.',
  retry: 'إعادة المحاولة',
  empty: 'لم تمنح أي أداة إذناً بعد. جرّب أداة أولاً ثم امنحها من هنا لتوفير خطوة التأكيد.',
  liveTitle: 'أذون سارية',
  grantableTitle: 'أدوات جرّبتها ويمكنك منحها',
  granted: 'مُنح {date}',
  lastUsed: 'آخر استخدام: {date}',
  neverUsed: 'لم تُستخدم بعد',
  revoke: 'سحب الإذن',
  revokeAria: 'سحب إذن {name}',
  grant: 'امنح الإذن',
  grantAria: 'منح إذن {name}',
  grantFailed: 'تعذّر منح الإذن.',
  revokeFailed: 'تعذّر سحب الإذن.',
  confirmRevokeTitle: 'سحب الإذن',
  confirmRevokeMessage:
    'هل تريد سحب إذن «{name}»؟ سيعود المساعد إلى طلب تأكيدك قبل كل استخدام لهذه الأداة.',
  confirmRevoke: 'سحب الإذن',
  cancel: 'إلغاء',
} as const;

/**
 * The member's per-tool trust (ADR-0180 decisions 2 and 4, #1438).
 *
 * The live grants they can revoke, and the tier-1 tools they have already seen
 * run and may grant. The server decides both lists: this view never names a
 * tool the service would refuse, so an unseen tool or a tier-2 one is absent
 * here because it is absent from the answer.
 *
 * It is rendered inside the connected-apps view, which the account page and the
 * apps sheet share, so both hosts draw the same rows from the same source.
 */
export function AssistantGrantsView() {
  const { user, isLoading: sessionLoading } = useSession();
  const [grants, setGrants] = useState<AgentToolGrant[] | null>(null);
  const [grantable, setGrantable] = useState<AgentGrantableTool[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AgentToolGrant | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const result = await getAgentToolGrants();
      if (!result.success) {
        setLoadFailed(true);
        return;
      }
      setGrants(result.grants ?? []);
      setGrantable(result.grantable ?? []);
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    if (sessionLoading || !user) return;
    void load();
  }, [sessionLoading, user, load]);

  const grant = async (tool: AgentGrantableTool) => {
    setBusy(tool.toolId);
    setActionError(null);
    try {
      const result = await grantAgentTool(tool.toolId);
      if (!result.success) {
        setActionError(result.error ?? GRANTS_COPY.grantFailed);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  const revoke = async (row: AgentToolGrant) => {
    setBusy(row.id);
    setActionError(null);
    setRevokeTarget(null);
    try {
      const result = await revokeAgentTool(row.id);
      if (!result.success) {
        setActionError(result.error ?? GRANTS_COPY.revokeFailed);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (sessionLoading || !user) return null;

  return (
    <section aria-labelledby="assistant-grants-title" className="space-y-3">
      <div className="space-y-1">
        <h2 id="assistant-grants-title" className="font-bold text-foreground">
          {GRANTS_COPY.title}
        </h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{GRANTS_COPY.body}</p>
      </div>

      {actionError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
        >
          {actionError}
        </p>
      )}

      {loadFailed ? (
        <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-bold text-destructive">{GRANTS_COPY.failed}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {GRANTS_COPY.retry}
          </button>
        </div>
      ) : grants === null ? (
        <div
          aria-busy="true"
          aria-label={GRANTS_COPY.loading}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border/40 bg-muted/40 py-6 text-sm text-muted-foreground"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          <span>{GRANTS_COPY.loading}</span>
        </div>
      ) : grants.length === 0 && grantable.length === 0 ? (
        <p className="rounded-2xl border border-border/50 bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {GRANTS_COPY.empty}
        </p>
      ) : (
        <div className="space-y-4">
          {grants.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground">{GRANTS_COPY.liveTitle}</h3>
              <ul className="space-y-2.5">
                {grants.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 space-y-1">
                        <p className="truncate max-sm:text-sm font-bold text-foreground sm:text-base">
                          {row.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <span>
                            {GRANTS_COPY.granted.replace('{date}', formatHijriDate(row.grantedAt))}
                          </span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {row.lastUsedAt
                              ? GRANTS_COPY.lastUsed.replace(
                                  '{date}',
                                  formatHijriDate(row.lastUsedAt)
                                )
                              : GRANTS_COPY.neverUsed}
                          </span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => setRevokeTarget(row)}
                      aria-label={GRANTS_COPY.revokeAria.replace('{name}', row.label)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 max-sm:text-xs font-bold text-destructive/90 transition-safe hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60 sm:text-sm"
                    >
                      <ShieldOff aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span>{GRANTS_COPY.revoke}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {grantable.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-muted-foreground">
                {GRANTS_COPY.grantableTitle}
              </h3>
              <ul className="space-y-2.5">
                {grantable.map((tool) => (
                  <li
                    key={tool.toolId}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5"
                  >
                    <p className="min-w-0 truncate max-sm:text-sm font-bold text-foreground sm:text-base">
                      {tool.label}
                    </p>
                    <button
                      type="button"
                      disabled={busy === tool.toolId}
                      onClick={() => void grant(tool)}
                      aria-label={GRANTS_COPY.grantAria.replace('{name}', tool.label)}
                      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-3 py-2 max-sm:text-xs font-bold text-foreground transition-safe hover:border-primary/30 hover:bg-primary/10 hover:text-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60 sm:text-sm"
                    >
                      <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      <span>{GRANTS_COPY.grant}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title={GRANTS_COPY.confirmRevokeTitle}
        message={GRANTS_COPY.confirmRevokeMessage.replace('{name}', revokeTarget?.label ?? '')}
        confirmLabel={GRANTS_COPY.confirmRevoke}
        cancelLabel={GRANTS_COPY.cancel}
        onConfirm={() => {
          if (revokeTarget) void revoke(revokeTarget);
        }}
        onCancel={() => {
          if (!busy) setRevokeTarget(null);
        }}
        isConfirming={busy !== null && revokeTarget !== null && busy === revokeTarget.id}
        variant="danger"
      />
    </section>
  );
}
