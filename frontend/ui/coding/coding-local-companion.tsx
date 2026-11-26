'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createCodingLocalPair,
  getCodingLocalGrants,
  revokeCodingLocalGrant,
} from '@/frontend/api/coding';
import type { CodingLocalGrantDto, CodingLocalPairDto } from '@/shared/contracts/coding-agent';
import { formatCodingDate, formatCodingTime } from './coding-labels';

/**
 * The local companion's door (ADR-0222). The member grants one folder on one
 * device; the code below is spent once and expires in ten minutes. The page
 * never learns the folder's path — only the device label comes back.
 */
export function CodingLocalCompanion({ onPaired }: { onPaired?: () => void }) {
  const [origin, setOrigin] = useState('');
  const [label, setLabel] = useState('');
  const [pair, setPair] = useState<CodingLocalPairDto | null>(null);
  const [grants, setGrants] = useState<CodingLocalGrantDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setGrants(await getCodingLocalGrants());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تحميل الأجهزة.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  const command = useMemo(() => {
    if (!pair || !origin) return '';
    const device = (label.trim() || pair.deviceLabel).replace(/"/g, '');
    return [
      'mkdir -p "$HOME/.noor"',
      `curl -fsSL ${origin}/coding/noor-local.mjs -o "$HOME/.noor/noor-local.mjs"`,
      `curl -fsSL ${origin}/coding/runner-v1.mjs -o "$HOME/.noor/runner-v1.mjs"`,
      `node "$HOME/.noor/noor-local.mjs" pair ${pair.code} --api ${origin} --folder . --label "${device}"`,
      `node "$HOME/.noor/noor-local.mjs" run --api ${origin}`,
    ].join('\n');
  }, [origin, pair, label]);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPair(null);
    try {
      setPair(await createCodingLocalPair(label.trim() || 'جهازي'));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء رمز الربط.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('تعذّر النسخ. حدّد الأوامر وانسخها يدويًا.');
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await revokeCodingLocalGrant(id);
      setRevokingId(null);
      await load();
      onPaired?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إلغاء ربط الجهاز.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/70 p-4">
      <div>
        <h2 className="text-lg font-bold text-foreground">مجلد على جهازك</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          شغّل المرافق داخل المجلد على جهازك، فيعمل المساعد عليه محليًا. لا يصل إلى خادمنا مسار المجلد
          ولا ملفاته ولا أي اعتماد؛ يصل رمز جهاز قابل للإلغاء فقط.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 p-3">
        <label className="flex min-w-52 flex-1 flex-col gap-1 text-xs">
          <span className="font-bold text-foreground">اسم الجهاز</span>
          <input
            type="text"
            maxLength={80}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="حاسوبي المحمول"
            className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void create()}
          disabled={busy}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'جاري الإنشاء...' : 'إنشاء رمز ربط'}
        </button>
      </div>

      {pair && (
        <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className="text-sm font-bold text-foreground">
            رمز الربط: <span className="font-mono tracking-wider">{pair.code}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            يُستخدم مرة واحدة وينتهي في {formatCodingTime(pair.expiresAt)}. افتح طرفية داخل المجلد
            الذي تريد منحه، ثم نفّذ الأوامر:
          </p>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-lg bg-background px-3 py-2 text-left text-xs leading-relaxed text-foreground"
          >
            <code>{command}</code>
          </pre>
          <p className="text-xs text-muted-foreground">
            على Windows PowerShell: استبدل السطر الأول بـ{' '}
            <code dir="ltr">ni -Force "$HOME/.noor" | Out-Null</code> واكتب{' '}
            <code dir="ltr">curl.exe</code> بدل <code dir="ltr">curl</code>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
            >
              {copied ? 'تم النسخ' : 'نسخ الأوامر'}
            </button>
            <button
              type="button"
              onClick={() => {
                void load();
                onPaired?.();
              }}
              className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
            >
              تحديث الأجهزة
            </button>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-foreground">الأجهزة المرتبطة</h3>
        {loading ? (
          <p className="mt-1 text-sm text-muted-foreground">جاري تحميل الأجهزة...</p>
        ) : grants.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            لا يوجد جهاز مرتبط بعد. أنشئ رمز ربط ثم شغّل المرافق داخل المجلد.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-bold text-foreground">{grant.deviceLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {grant.revokedAt
                      ? `أُلغي في ${formatCodingDate(grant.revokedAt)}`
                      : grant.lastSeenAt
                        ? `آخر اتصال: ${formatCodingDate(grant.lastSeenAt)}`
                        : 'لم يتصل بعد'}
                  </p>
                </div>
                {grant.revokedAt ? null : revokingId === grant.id ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void revoke(grant.id)}
                      disabled={busy}
                      className="rounded-lg bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground disabled:opacity-60"
                    >
                      تأكيد الإلغاء
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokingId(null)}
                      className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
                    >
                      تراجع
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevokingId(grant.id)}
                    className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground"
                  >
                    إلغاء الربط
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
