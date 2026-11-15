'use client';

import { useEffect, useId, useState } from 'react';
import { MonitorSmartphone, RefreshCw, Share2, Smartphone, type LucideIcon } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { installChannelFor, type InstallChannel } from '@/frontend/shared/install-target';
import { isNativeApp } from '@/frontend/shared/native-shell';
import {
  fetchShellManifest,
  shellVersionFromUserAgent,
  shellVersionNameFromUserAgent,
  toShellUpdateState,
  type ShellManifest,
} from '@/frontend/shared/shell-update';
import { usePWAContext } from '@/frontend/ui/PWAProvider';

import { rowClasses } from './row-classes';

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

const INSTALL_LABEL = 'تثبيت التَّطبيق';

/**
 * The one install this device can actually perform (#1500), drawn as a single
 * row — never an expander over a list of one.
 *
 * The plan comes from `installChannelFor`: Android downloads the APK, a Chromium
 * desktop calls the browser's own prompt, and Safari (iOS, macOS 17+) gets the
 * steps in its own menus, because it installs without exposing a prompt. The
 * browsers with no install path at all (Firefox, and Chrome/Edge on iOS) get no
 * row: an instruction there would be false.
 *
 * Inside the shell neither applies — there is nothing to install — so the same
 * row becomes an on-demand check against the manifest, and it names the installed
 * version beside it: the number belongs with the check that reads it, not at the
 * foot of the page (ADR-0046).
 *
 * The shell is recognised from its user agent first. `isNativeApp()` reads the
 * bridge, which the page does not always receive on an older WebView
 * (ionic-team/capacitor#7454), and reading "web" there would offer a visitor
 * inside the app an install they cannot use.
 */
export function InstallSection() {
  const { canInstall, isInstalled, promptInstall } = usePWAContext();
  const [mode, setMode] = useState<ShellMode>('pending');
  const [channel, setChannel] = useState<InstallChannel>('none');
  const [shellVersion, setShellVersion] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ShellManifest | null>(null);
  const [status, setStatus] = useState<CheckStatus>('idle');
  const statusId = useId();

  useEffect(() => {
    const installed = shellVersionFromUserAgent(navigator.userAgent);
    setMode(installed !== null || isNativeApp() ? 'app' : 'web');
    setChannel(installChannelFor(navigator.userAgent, navigator.maxTouchPoints ?? 0));
    setShellVersion(shellVersionNameFromUserAgent(navigator.userAgent));
  }, []);

  // The APK's URL is read from beside the site, so the row always points at the
  // newest release rather than at a shape someone has to keep in step.
  const downloadsApk = mode === 'web' && channel === 'android-apk' && !isInstalled;
  useEffect(() => {
    if (!downloadsApk) return;

    let cancelled = false;
    void fetchShellManifest().then((next) => {
      if (!cancelled) setManifest(next);
    });

    return () => {
      cancelled = true;
    };
  }, [downloadsApk]);

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
            <span className="min-w-0">
              <span className="block truncate">
                {status === 'checking' ? 'جاري التَّحقُّق…' : 'التَّحقُّق من وجود تحديث'}
              </span>
              {shellVersion && (
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  الإصدار {shellVersion}
                </span>
              )}
            </span>
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

  // A browser that already has the app has nothing to install, whichever
  // channel it would have used.
  if (isInstalled) return null;

  if (channel === 'android-apk') {
    const apkUrl = manifest?.apkUrl ?? null;

    // No readable manifest means no link: a row that expands into nothing is
    // worse than no row.
    if (!apkUrl) return null;

    return (
      <InstallRow
        as="link"
        href={apkUrl}
        icon={Smartphone}
        label="تنزيل تطبيق الأندرويد"
        description={
          manifest?.versionName ? `ملف APK — الإصدار ${manifest.versionName}` : 'ملف APK'
        }
      />
    );
  }

  if (channel === 'ios-steps') {
    return (
      <InstallRow
        as="hint"
        icon={Share2}
        label={INSTALL_LABEL}
        description="من زر المشاركة ← إضافة إلى الشَّاشة الرَّئيسيَّة"
      />
    );
  }

  if (channel === 'macos-steps') {
    return (
      <InstallRow
        as="hint"
        icon={MonitorSmartphone}
        label={INSTALL_LABEL}
        description="من قائمة ملف ← إضافة إلى Dock"
      />
    );
  }

  // The browser's own prompt, where it has one. A Chromium that has not offered
  // it yet (first visit, criteria not met) gets no row rather than a button that
  // would do nothing.
  if (channel !== 'browser-prompt' || !canInstall) return null;

  return (
    <InstallRow
      as="button"
      onClick={() => void promptInstall()}
      icon={MonitorSmartphone}
      label={INSTALL_LABEL}
      description="أضِف الموقع إلى شاشتك الرَّئيسيَّة"
    />
  );
}

/**
 * One row, one install. Three shapes share it: the APK link and the browser
 * prompt are actions and end with the arrow; the Safari hint is a written
 * instruction, so it stays a plain block — no focus ring, no hover, nothing to
 * tap that would go nowhere.
 */
function InstallRow(
  props:
    | {
        as: 'link';
        href: string;
        icon: LucideIcon;
        label: string;
        description: string;
      }
    | {
        as: 'button';
        onClick: () => void;
        icon: LucideIcon;
        label: string;
        description: string;
      }
    | {
        as: 'hint';
        icon: LucideIcon;
        label: string;
        description: string;
      }
) {
  const body = (
    <span className="flex min-w-0 items-start gap-2.5">
      <props.icon className="mt-0.5 w-4 h-4 shrink-0 text-primary" />
      <span className="min-w-0">
        <span className="block truncate">{props.label}</span>
        <span className="mt-0.5 block text-[11px] font-normal leading-relaxed text-muted-foreground">
          {props.description}
        </span>
      </span>
    </span>
  );

  if (props.as === 'hint') {
    return (
      <div
        className={cn(
          rowClasses,
          'cursor-default hover:border-border/50 hover:bg-card/60 hover:text-foreground'
        )}
      >
        {body}
      </div>
    );
  }

  const arrow = (
    <span className="text-primary/70 opacity-0 -translate-x-1 transition-safe duration-150 ease-out group-hover:opacity-100 group-hover:translate-x-0">
      ←
    </span>
  );

  if (props.as === 'link') {
    return (
      <a href={props.href} className={rowClasses}>
        {body}
        {arrow}
      </a>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className={rowClasses}>
      {body}
      {arrow}
    </button>
  );
}
