'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleAlert,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { formatBytes } from '@/frontend/shared/format-bytes';
import { calculateTimeAgo } from '@/frontend/shared/format';
import {
  readShellLastFlush,
  requestOutboxFlush,
  requestShellFlush,
  type ShellLastFlush,
} from '@/frontend/shared/local-store/background-sync';
import {
  AUDIO_BUDGET_BYTES,
  audioUsageBytes,
  listDownloadedSuras,
  openAudioBytesStore,
  removeAllAudio,
  removeSurahAudio,
  type SurahAudioCopySummary,
} from '@/frontend/shared/local-store/audio';
import {
  DeviceListingUnsupportedError,
  derivedDeviceCopies,
  readDeviceCopies,
  removeDeviceCopies,
  retryDeviceEntry,
  type DeviceCopyRemoval,
  type DeviceStoreCopy,
} from '@/frontend/shared/local-store/device-copy';
import { userIdentity, type LocalIdentity } from '@/frontend/shared/local-store/identity';
import {
  PUBLIC_SNAPSHOT_SCOPE,
  clearSnapshotsFor,
  screenful,
  useSnapshot,
  useSnapshotRecorder,
  writeSnapshot,
} from '@/frontend/shared/local-store/snapshot';
import { useSession } from '@/frontend/state/session-provider';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';

/**
 * The device's data, as the person holding it sees it (#370).
 *
 * It cannot simply be an `/account` page: that prefix is in the worker's
 * never-cache list, because a signed-in document there could leak one session's
 * data to the next (ADR-0031). This page is the opposite — a data-free shell
 * that is safe to cache, with every fact painted from IndexedDB after mount — so
 * it is the one account-adjacent surface that still works with the radio off.
 * See ADR-0070. The background tier on top of it is labeled here and nowhere
 * else (#455): the shell's last reported drain, read back through the
 * `RoyShellSync` bridge, where the pill decides — per ADR-0027's amendment —
 * never to gain a state for it.
 */

type LoadStatus = 'loading' | 'ready' | 'unsupported' | 'error';

/**
 * The page's snapshot (#495), under the public scope on purpose: what it lists is
 * what this browser already holds without a session, so it is not account-bearing
 * — and a borrowed device is exactly when `/device` is opened, after someone has
 * signed out and the identity-scoped snapshots are gone.
 */
const DEVICE_ROUTE = '/device';

interface DeviceSnapshot {
  status: 'ready' | 'unsupported';
  copies: DeviceStoreCopy[];
  /** The recitation copies, listed beside the Local Store copies (ADR-0081). */
  audio?: DeviceAudioState | null;
}

/** What the Quran's offline copies cost, and which suras they are. */
interface DeviceAudioState {
  readonly usage: number;
  readonly suras: SurahAudioCopySummary[];
}

/** The byte budget's second pass over the copies. */
function trimDevice(data: DeviceSnapshot): DeviceSnapshot | null {
  const copies = data.copies.slice(0, Math.ceil(data.copies.length / 2));
  return copies.length === 0 ? { status: data.status, copies: [] } : { ...data, copies };
}

interface CopyGroup {
  identity: string;
  copies: DeviceStoreCopy[];
}

type DerivedCopy = ReturnType<typeof derivedDeviceCopies>[number];

function identityLabel(identity: string): string {
  return identity === 'guest' ? 'نسخة الزَّائر' : 'نسخة الحساب';
}

function identityDetail(identity: string): string {
  if (identity === 'guest') return 'بيانات أُنشئت قبل تسجيل الدُّخول أو بلا حساب';
  const id = identity.slice('user:'.length);
  return `الحساب ${id.length > 8 ? `${id.slice(0, 8)}…` : id}`;
}

function groupByCopy(copies: DeviceStoreCopy[]): CopyGroup[] {
  const groups = new Map<string, DeviceStoreCopy[]>();
  for (const copy of copies) {
    const existing = groups.get(copy.identity);
    if (existing) existing.push(copy);
    else groups.set(copy.identity, [copy]);
  }

  // The signed-in copy first: that is the one a shared device is usually about.
  return [...groups.entries()]
    .map(([identity, entries]) => ({ identity, copies: entries }))
    .sort((a, b) => Number(a.identity === 'guest') - Number(b.identity === 'guest'));
}

function count(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 0) return `0 ${many}`;
  if (n === 1) return one;
  if (n === 2) return two;
  return n <= 10 ? `${n} ${few}` : `${n} ${many}`;
}

const countStores = (n: number) => count(n, 'مخزن واحد', 'مخزنان', 'مخازن', 'مخزنًا');
const countOperations = (n: number) => count(n, 'عملية واحدة', 'عمليتان', 'عمليات', 'عملية');

function removeMessage(removal: DeviceCopyRemoval, identity: string, counted: boolean): string {
  if (removal.removed.length === 0 && removal.blocked.length > 0) {
    return 'لم تُحذف أيُّ نسخة: المخازن مفتوحة في نافذة أخرى. أغلق النَّوافذ الأخرى ثمَّ أعد المحاولة.';
  }

  const blocked =
    removal.blocked.length > 0
      ? ` بقي ${countStores(removal.blocked.length)} مفتوحًا في نافذة أخرى — أغلقه ثمَّ أعد المحاولة.`
      : '';

  // Without a database listing the delete still ran, but the count is a guess:
  // say what happened, not how many stores it took.
  if (!counted) return `أُزيلت ${identityLabel(identity)} من هذا الجهاز.${blocked}`;

  const stores = `أُزيلت ${identityLabel(identity)} — ${countStores(removal.removed.length)}`;
  const queued =
    removal.queued > 0
      ? `، ومعها ${countOperations(removal.queued)} لم تُزامَن بعد`
      : '، ولم يكن فيها شيء بانتظار المزامنة';

  return stores + queued + '.' + blocked;
}

/**
 * What the shell's last reported drain said, in the page's counting voice.
 * Zeroes with no error are not dressed up as an error; the counts line speaks
 * for itself.
 */
function lastFlushLine(lastFlush: ShellLastFlush): string {
  if (lastFlush.delivered === 0 && lastFlush.pulled === 0 && lastFlush.left === 0) {
    return 'لم يكن في آخر استيقاظ شيء بانتظار المزامنة.';
  }

  return `سلَّمت ${countOperations(lastFlush.delivered)} وسحبت ${countOperations(
    lastFlush.pulled
  )}، وبقي ${countOperations(lastFlush.left)} بانتظار المزامنة.`;
}

export function DeviceView() {
  const { user } = useSession();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [copies, setCopies] = useState<DeviceStoreCopy[]>([]);
  /** The Quran's kept recitations; null until read, or when the index failed. */
  const [audio, setAudio] = useState<DeviceAudioState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /** What the shell recorded of its last background drain (#455); null without a shell. */
  const [lastFlush, setLastFlush] = useState<ShellLastFlush | null>(null);
  /** The identity whose copy the confirm dialog is about. */
  const [pendingIdentity, setPendingIdentity] = useState<string | null>(null);

  // The list this page last painted (#495), read during render so a cold open of
  // `/device` — the page a device is inspected on, often offline — is not a
  // skeleton while IndexedDB is asked.
  const snapshot = useSnapshot<DeviceSnapshot>(PUBLIC_SNAPSHOT_SCOPE, DEVICE_ROUTE);

  /**
   * The recitation copies, read from their own index. Kept out of the copies
   * read on purpose: a browser that cannot list its databases can still hold
   * audio, and a failure here must not turn the page into a listing failure.
   */
  const readAudio = useCallback(async () => {
    try {
      const [suras, usage] = await Promise.all([listDownloadedSuras(), audioUsageBytes()]);
      setAudio({ suras, usage });
    } catch {
      setAudio(null);
    }
  }, []);

  const load = useCallback(async () => {
    void readAudio();
    try {
      const next = await readDeviceCopies();
      setCopies(next);
      // The bridge is the shell's own; a browser answers null, and the page's
      // background tier stays out entirely.
      setLastFlush(readShellLastFlush());
      setStatus('ready');
    } catch (error) {
      const unsupported = error instanceof DeviceListingUnsupportedError;
      setStatus(unsupported ? 'unsupported' : 'error');
      // "No action can be taken" is not worth recording — the next visit
      // re-derives it synoptically — and a failed read says nothing about the
      // copies, so neither replaces the last good list.
      if (unsupported) {
        writeSnapshot(PUBLIC_SNAPSHOT_SCOPE, DEVICE_ROUTE, {
          status: 'unsupported',
          copies: [],
        });
      }
    }
  }, [readAudio]);

  useEffect(() => {
    void load();
  }, [load]);

  /** What a browser without `databases()` can still offer: the names it can derive. */
  const derived = useMemo(() => {
    const names = derivedDeviceCopies('guest');
    if (user?.id) names.push(...derivedDeviceCopies(userIdentity(user.id)));
    return names;
  }, [user?.id]);

  const groups = useMemo(() => groupByCopy(copies), [copies]);

  // What the page shows: the read once it answers, the last painted list before
  // that, and the last painted list under a failed refresh — the error banner is
  // its own line rather than a replacement for what the device holds. A refresh
  // keeps the rows on screen while it re-reads.
  const listStatus: LoadStatus =
    status === 'ready' || status === 'unsupported' ? status : (snapshot?.status ?? status);
  const shownGroups = useMemo(
    () => (status === 'ready' ? groups : groupByCopy(snapshot?.copies ?? [])),
    [status, groups, snapshot]
  );

  /** The kept recitations to render: this read, or the last one painted (#495). */
  const shownAudio = audio ?? snapshot?.audio ?? null;

  // The list this page painted, recorded after paint: a cold open of `/device`
  // carries both what the Local Store holds and what the Quran kept.
  const snapshotData = useMemo(
    () =>
      status === 'ready' ? { status: 'ready' as const, copies: screenful(copies), audio } : null,
    [status, copies, audio]
  );
  useSnapshotRecorder(PUBLIC_SNAPSHOT_SCOPE, DEVICE_ROUTE, snapshotData, { trim: trimDevice });

  const retry = useCallback(
    async (copy: DeviceStoreCopy, seq: number) => {
      const key = `${copy.name}:${seq}`;
      setBusy(key);
      setNotice(null);

      try {
        const rearmed = await retryDeviceEntry(copy.name, seq);
        if (!rearmed) {
          setNotice('لم تعد هذه العمليَّة موجودة؛ حُدِّثت القائمة.');
        } else {
          // The queue is due again; ask every tier that exists to deliver it.
          void requestOutboxFlush().catch(() => undefined);
          requestShellFlush();
          setNotice('أُعيدت العمليَّة إلى قائمة الانتظار، وستُزامَن عند توفُّر الاتِّصال.');
        }
        await load();
      } catch {
        setNotice('تعذَّرت إعادة المحاولة. أعد فتح الصَّفحة ثمَّ جرِّب مرَّة أخرى.');
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  /** Exactly what the confirm dialog is about, whichever list the page has. */
  const pending = useMemo(() => {
    if (!pendingIdentity) return null;

    if (listStatus === 'unsupported') {
      const names = derived
        .filter((copy) => copy.identity === pendingIdentity)
        .map((copy) => copy.name);
      return { names, stores: names.length, queued: null as number | null };
    }

    const copies = shownGroups.find((group) => group.identity === pendingIdentity)?.copies ?? [];
    return {
      names: copies.map((copy) => copy.name),
      stores: copies.length,
      queued: copies.reduce((total, copy) => total + copy.entries.length, 0),
    };
  }, [derived, shownGroups, pendingIdentity, listStatus]);

  const remove = useCallback(async () => {
    if (!pendingIdentity || !pending) return;

    setBusy('remove');
    setNotice(null);

    try {
      const removal = await removeDeviceCopies(pending.names);
      setNotice(removeMessage(removal, pendingIdentity, pending.queued !== null));
      // The rows are gone from IndexedDB, so the snapshots of them go too: a
      // removed partition must not repaint on the next cold open (#495).
      for (const name of removal.removed) {
        const separator = name.indexOf('__');
        const identity = separator > 0 ? name.slice(separator + 2) : '';
        if (identity === 'guest' || identity.startsWith('user:')) {
          clearSnapshotsFor(identity as LocalIdentity);
        }
      }
      setPendingIdentity(null);
      await load();
    } catch {
      setNotice('تعذَّرت الإزالة. أعد فتح الصَّفحة ثمَّ جرِّب مرَّة أخرى.');
    } finally {
      setBusy(null);
    }
  }, [load, pending, pendingIdentity]);

  /**
   * Removing a kept recitation. Its own handler rather than the copies' one:
   * audio lives in a store that is not a Local Store partition, so it is
   * removed by Surah and not by identity (ADR-0081).
   */
  const removeAudio = useCallback(
    async (summary: SurahAudioCopySummary | null) => {
      setBusy(summary ? `audio:${summary.surah}` : 'audio:all');
      setNotice(null);

      try {
        const store = await openAudioBytesStore();
        if (store) {
          if (summary) await removeSurahAudio(summary.edition, summary.surah, { store });
          else await removeAllAudio({ store });
        }
        setNotice(
          summary
            ? `أُزيلت تلاوة ${summary.name ?? `السُّورة ${summary.surah}`} من هذا الجُهاز.`
            : 'أُزيلت كلُّ التِّلاوات المحفوظة من هذا الجُهاز.'
        );
        await readAudio();
      } catch {
        setNotice('تعذَّرت إزالة التِّلاوة. أعد فتح الصَّفحة ثمَّ جرِّب مرَّة أخرى.');
      } finally {
        setBusy(null);
      }
    },
    [readAudio]
  );

  return (
    <div className="space-y-6">
      <header className="flex justify-center">
        <button
          type="button"
          onClick={() => {
            setStatus('loading');
            setNotice(null);
            void load();
          }}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3.5 py-1.5 text-xs font-bold text-muted-foreground transition-safe duration-150 hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', status === 'loading' && 'animate-spin')} />
          <span>تحديث القراءة</span>
        </button>
      </header>

      {notice && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-xs leading-relaxed text-foreground sm:text-sm"
        >
          {notice}
        </p>
      )}

      {listStatus === 'loading' && (
        <div className="space-y-3" aria-busy="true" aria-label="جاري قراءة التَّخزين المحلِّي">
          <div className="h-24 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
          <div className="h-24 animate-pulse rounded-2xl border border-border/40 bg-muted/40" />
        </div>
      )}

      {status === 'error' && (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-destructive">
          تعذَّرت قراءة التَّخزين المحلِّي. أعد فتح الصَّفحة ثمَّ جرِّب مرَّة أخرى.
        </p>
      )}

      {listStatus === 'unsupported' && (
        <section className="space-y-3">
          <p className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
            لا يستطيع هذا المتصفِّح سرد مخازن الجهاز، فلا يمكن عرض قائمة الانتظار هنا. تبقى إزالة
            النُّسخ متاحة.
          </p>
          {groupByDerived(derived).map((group) => (
            <section
              key={group.identity}
              className="rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-foreground sm:text-base">
                    {identityLabel(group.identity)}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                    {identityDetail(group.identity)}
                  </p>
                </div>
                <RemoveButton
                  label={identityLabel(group.identity)}
                  onClick={() => setPendingIdentity(group.identity)}
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                المخازن المحتملة: {countStores(group.copies.length)}.
              </p>
            </section>
          ))}
        </section>
      )}

      {listStatus === 'ready' && shownGroups.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80">
            <HardDrive size={24} />
          </div>
          <p className="text-sm font-bold text-foreground sm:text-base">
            لا توجد نسخة محلِّيَّة على هذا الجهاز
          </p>
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
            لا يحفظ هذا المتصفِّح أيَّ بيانات منتج أو عمليَّات بانتظار المزامنة الآن.
          </p>
        </section>
      )}

      {listStatus === 'ready' &&
        shownGroups.map((group) => (
          <CopyGroupCard
            key={group.identity}
            group={group}
            busy={busy}
            onRetry={retry}
            onRemove={() => setPendingIdentity(group.identity)}
          />
        ))}

      {listStatus !== 'loading' && (
        <AudioCard
          audio={shownAudio}
          busy={busy}
          onRemove={(summary) => void removeAudio(summary)}
          onRemoveAll={() => void removeAudio(null)}
        />
      )}

      {lastFlush && (
        <section className="space-y-2 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground sm:text-base">المزامنة في الخلفية</h2>
            <span className="text-[11px] text-muted-foreground sm:text-xs">
              {calculateTimeAgo(new Date(lastFlush.at).toISOString())}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
            {lastFlushLine(lastFlush)}
          </p>
          {lastFlush.error && (
            <p className="text-xs leading-relaxed text-destructive">
              <span className="font-bold">تعذَّرت المزامنة:</span> {lastFlush.error}
            </p>
          )}
          {/* The shell notes' own concession (ADR-0059): what FCM cannot do. */}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            التَّطبيق الموقوف قسرًا ينتظر الدَّورة الأدنى — تنبيه الإيقاظ لا يصل إليه.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={pendingIdentity !== null}
        title={pendingIdentity ? `إزالة ${identityLabel(pendingIdentity)}` : 'إزالة النسخة'}
        message={
          <>
            سيُحذف من هذا الجهاز نهائيًّا: {countStores(pending?.stores ?? 0)}
            {pending?.queued
              ? `، ومعها ${countOperations(pending.queued)} لم تُزامَن بعد — لن تصل إلى الخادم.`
              : '.'}{' '}
            تبقى بياناتك على الخادم كما هي. لا يمكن التَّراجع عن هذا الإجراء.
          </>
        }
        confirmLabel="إزالة"
        cancelLabel="إلغاء"
        icon={Trash2}
        isConfirming={busy === 'remove'}
        onConfirm={() => void remove()}
        onCancel={() => setPendingIdentity(null)}
      />
    </div>
  );
}

/**
 * The Quran's kept recitations (#559), beside the Local Store copies and in the
 * same vocabulary (ADR-0070): what this device holds, what it costs, and one
 * action that frees it. Not a second storage screen — the same page, one more
 * kind of byte.
 */
function AudioCard({
  audio,
  busy,
  onRemove,
  onRemoveAll,
}: {
  audio: DeviceAudioState | null;
  busy: string | null;
  onRemove: (summary: SurahAudioCopySummary) => void;
  onRemoveAll: () => void;
}) {
  const suras = audio?.suras ?? [];
  const used = audio && audio.usage > 0 ? formatBytes(audio.usage) : null;
  const budget = formatBytes(AUDIO_BUDGET_BYTES);

  return (
    <section
      aria-labelledby="device-audio"
      className="space-y-3 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="device-audio" className="text-sm font-bold text-foreground sm:text-base">
            التِّلاوات المحفوظة
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
            {used
              ? `${used} من ${budget ?? ''} مخصَّصة للتِّلاوة`
              : 'لا تشغل التِّلاوات أيَّ مساحة'}
          </p>
        </div>
        {suras.length > 1 && (
          <button
            type="button"
            onClick={onRemoveAll}
            disabled={busy === 'audio:all'}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-destructive/30 px-3.5 py-1.5 text-xs font-bold text-destructive transition-safe duration-150 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
          >
            {busy === 'audio:all' ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>إزالة كل التِّلاوات</span>
          </button>
        )}
      </div>

      {suras.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
          لا توجد تلاوة محفوظة على هذا الجُهاز. تُحفظ التِّلاوة من صفحة السُّورة، وتُشغَّل بعدها دون
          اتِّصال.
        </p>
      ) : (
        <ul className="space-y-2">
          {suras.map((summary) => {
            const key = `${summary.edition}:${summary.surah}`;
            const isBusy = busy === `audio:${summary.surah}`;
            const size = formatBytes(summary.bytes);

            return (
              <li
                key={key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-background/40 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground sm:text-sm">
                    {summary.name ?? `السُّورة ${summary.surah}`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
                    <span className="font-heading">{summary.ayat}</span>{' '}
                    {summary.ayat === 1 ? 'آية' : 'آيات'}
                    {size ? ` · ${size}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(summary)}
                  disabled={isBusy}
                  aria-label={`إزالة تلاوة ${summary.name ?? `السُّورة ${summary.surah}`}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-bold text-foreground transition-safe duration-150 hover:border-destructive/30 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30 disabled:opacity-60"
                >
                  {isBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  <span>إزالة</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function groupByDerived(copies: DerivedCopy[]): { identity: string; copies: DerivedCopy[] }[] {
  return [...new Set(copies.map((copy) => copy.identity))].map((identity) => ({
    identity,
    copies: copies.filter((copy) => copy.identity === identity),
  }));
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-destructive/30 px-3.5 py-1.5 text-xs font-bold text-destructive transition-safe duration-150 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
    >
      <Trash2 className="h-3.5 w-3.5 shrink-0" />
      <span>إزالة {label}</span>
    </button>
  );
}

function CopyGroupCard({
  group,
  busy,
  onRetry,
  onRemove,
}: {
  group: CopyGroup;
  busy: string | null;
  onRetry: (copy: DeviceStoreCopy, seq: number) => Promise<void>;
  onRemove: () => void;
}) {
  const entries = group.copies.flatMap((copy) => copy.entries);
  const pending = entries.filter((entry) => entry.status === 'pending').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return (
    <section className="space-y-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-foreground sm:text-base">
            {identityLabel(group.identity)}
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
            {identityDetail(group.identity)}
          </p>
          <p className="mt-2 text-xs font-bold text-foreground/80">
            {pending > 0 ? `${pending} بانتظار المزامنة` : 'لا شيء بانتظار المزامنة'}
            {failed > 0 && <span className="text-destructive"> · {failed} فشل</span>}
          </p>
        </div>
        <RemoveButton label={identityLabel(group.identity)} onClick={onRemove} />
      </div>

      <ul className="space-y-3">
        {group.copies.map((copy) => (
          <li key={copy.name} className="rounded-xl border border-border/40 bg-background/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-bold text-foreground sm:text-sm">
                <Database className="h-3.5 w-3.5 shrink-0 text-primary" />
                {copy.label}
              </span>
              <span className="text-[11px] text-muted-foreground sm:text-xs">
                {copy.entries.length > 0 ? countOperations(copy.entries.length) : 'فارغ'}
              </span>
            </div>

            {copy.error ? (
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-destructive sm:text-xs">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>تعذَّرت قراءة قائمة الانتظار: {copy.error}</span>
              </p>
            ) : null}

            {copy.entries.length > 0 && (
              <ul className="mt-2 space-y-2">
                {copy.entries.map((entry) => {
                  const key = `${copy.name}:${entry.seq}`;
                  const isBusy = busy === key;

                  return (
                    <li
                      key={entry.seq}
                      className="rounded-lg border border-border/40 bg-card/40 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 font-mono text-[11px] text-foreground/90 sm:text-xs">
                          <span className="font-bold">{entry.type}</span>
                          <span className="text-muted-foreground"> · {entry.entity}</span>
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {calculateTimeAgo(new Date(entry.createdAt).toISOString())}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={cn(
                            'text-[11px] font-bold',
                            entry.status === 'failed' ? 'text-destructive' : 'text-amber-600'
                          )}
                        >
                          {entry.status === 'failed'
                            ? 'فشل دائم'
                            : entry.nextAttemptAt > Date.now()
                              ? 'بانتظار انتهاء المهلة'
                              : 'بانتظار المزامنة'}
                          {entry.attempts > 0 && ` · محاولات: ${entry.attempts}`}
                        </span>

                        {entry.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void onRetry(copy, entry.seq)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-bold text-foreground transition-safe duration-150 hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
                          >
                            {isBusy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3 w-3" />
                            )}
                            <span>إعادة المحاولة</span>
                          </button>
                        )}
                      </div>

                      {entry.lastError && (
                        <p
                          title={entry.lastError}
                          className="mt-1.5 truncate font-mono text-[11px] text-destructive/90"
                        >
                          {entry.lastError}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
