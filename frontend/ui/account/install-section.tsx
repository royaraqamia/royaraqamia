'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, Download, MonitorSmartphone, RefreshCw, Smartphone } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { isNativeApp } from '@/frontend/shared/native-shell';
import {
  fetchShellManifest,
  shellVersionFromUserAgent,
  toShellUpdateState,
  type ShellManifest,
} from '@/frontend/shared/shell-update';
import { usePWAContext } from '@/frontend/ui/PWAProvider';

import { rowClasses, subRowClasses } from './row-classes';

/**
 * How this document got here. `app` means the Android shell (the site inside the
 * Capacitor WebView), which installs nothing — it asks whether it is behind
 * instead. Resolved after mount: the answer lives in the user agent, which the
 * server does not have.
 */
type ShellMode = 'pending' | 'app' | 'web';

type CheckStatus = 'idle' | 'checking' | 'current' | 'update-available' | 'error';

const CHECK_MESSAGES: Record<CheckStatus, string> = {
  idle: '',
  checking: '',
  current: 'أنت على أحدث إصدار.',
  'update-available': 'يتوفَّر تحديث جديد — سيُعرَض عليك عند إعادة فتح التَّطبيق.',
  error: 'تعذَّر التَّحقُّق من التَّحديث. حاول مرَّة أخرى.',
};

/**
 * The install / update entry in `/account`, and the only place the two channels
 * meet. In a browser it expands into what each install is: the PWA (through the
 * browser's own prompt) and the Android APK (through the manifest the shell
 * publishes). Inside the shell neither applies — there is nothing to install —
 * so the same row becomes an on-demand check against that manifest.
 *
 * The shell is recognised from its user agent first. `isNativeApp()` reads the
 * bridge, which the page does not always receive on an older WebView
 * (ionic-team/capacitor#7454), and reading "web" there would offer a visitor
 * inside the app two installs they cannot use.
 */
export function InstallSection() {
  const { canInstall, isInstalled, promptInstall } = usePWAContext();
  const [mode, setMode] = useState<ShellMode>('pending');
  const [isOpen, setIsOpen] = useState(false);
  const [manifest, setManifest] = useState<ShellManifest | null>(null);
  const [status, setStatus] = useState<CheckStatus>('idle');
  const panelId = useId();
  const statusId = useId();

  useEffect(() => {
    const inShell = shellVersionFromUserAgent(navigator.userAgent) !== null || isNativeApp();
    setMode(inShell ? 'app' : 'web');
  }, []);

  // The APK's URL is read from beside the site, so the row always points at the
  // newest release rather than at a shape someone has to keep in step.
  useEffect(() => {
    if (mode !== 'web') return;

    let cancelled = false;
    void fetchShellManifest().then((next) => {
      if (!cancelled) setManifest(next);
    });

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const checkForUpdate = async () => {
    setStatus('checking');

    const installedCode = shellVersionFromUserAgent(navigator.userAgent);
    const latest = await fetchShellManifest();

    if (!latest || installedCode === null) {
      setStatus('error');
      return;
    }

    const state = toShellUpdateState(latest, installedCode);
    setStatus(state.updatePending || state.unsupported ? 'update-available' : 'current');
  };

  if (mode === 'pending') return null;

  if (mode === 'app') {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={checkForUpdate}
          disabled={status === 'checking'}
          className={cn(rowClasses, status === 'checking' && 'opacity-70')}
        >
          <span className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 shrink-0 text-primary" />
            <span>{status === 'checking' ? 'جاري التَّحقُّق…' : 'التَّحقُّق من وجود تحديث'}</span>
          </span>
        </button>
        <p
          id={statusId}
          role="status"
          aria-live="polite"
          className="px-1 text-xs leading-relaxed text-muted-foreground"
        >
          {CHECK_MESSAGES[status]}
        </p>
      </div>
    );
  }

  const showPwa = canInstall && !isInstalled;
  const apkUrl = manifest?.apkUrl ?? null;

  // Nothing installable here (no browser prompt and no readable manifest): a row
  // that expands into nothing is worse than no row.
  if (!showPwa && !apkUrl) return null;

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen(!isOpen)}
        className={rowClasses}
      >
        <span className="flex items-center gap-2.5">
          <Download className="w-4 h-4 shrink-0 text-primary" />
          <span>تثبيت التَّطبيق</span>
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-primary/70 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div
          id={panelId}
          className="flex flex-col gap-0.5 rounded-2xl border border-border/50 bg-card/40 p-1.5"
        >
          {showPwa && (
            <button type="button" onClick={() => void promptInstall()} className={subRowClasses}>
              <SubRowBody
                icon={MonitorSmartphone}
                label="تثبيت تطبيق الويب"
                description="أضِف الموقع إلى شاشتك الرَّئيسيَّة"
              />
            </button>
          )}

          {apkUrl && (
            <a href={apkUrl} className={subRowClasses}>
              <SubRowBody
                icon={Smartphone}
                label="تنزيل تطبيق الأندرويد"
                description={
                  manifest?.versionName ? `ملف APK — الإصدار ${manifest.versionName}` : 'ملف APK'
                }
              />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function SubRowBody({
  icon: Icon,
  label,
  description,
}: {
  icon: typeof Download;
  label: string;
  description: string;
}) {
  return (
    <>
      <span className="flex min-w-0 items-start gap-2.5">
        <Icon className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold sm:text-sm">{label}</span>
          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
            {description}
          </span>
        </span>
      </span>
      <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
        ←
      </span>
    </>
  );
}
