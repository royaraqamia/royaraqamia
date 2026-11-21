'use client';

import { useEffect, useState } from 'react';

import { fetchShellManifest, shellVersionFromUserAgent } from '@/frontend/shared/shell-update';

/**
 * The one-time bridge for shells whose own update card is broken (#1247).
 *
 * Those builds close the app when a card appears, so they can never tap their way
 * to the fix. This banner is the one door out: it is shown only to a shell below
 * the corrected version, and only while a manifest names a usable APK. Once that
 * shell installs the fix its user agent names the corrected version, the banner
 * disappears on its own, and every later update is the app's own native card with
 * its progress bar — no website, no second update system.
 *
 * Delete this component, its render in `HomePageContent` and its test once the
 * old shells are gone. It exists for one migration, not as a second channel.
 */
const CORRECTED_VERSION_CODE = 20300;

export function ShellUpdateBridgeBanner() {
  const [affected, setAffected] = useState(false);
  const [apkUrl, setApkUrl] = useState<string | null>(null);

  useEffect(() => {
    const installed = shellVersionFromUserAgent(navigator.userAgent);
    if (installed === null || installed >= CORRECTED_VERSION_CODE) return;

    setAffected(true);
    let cancelled = false;
    void fetchShellManifest().then((manifest) => {
      if (!cancelled && manifest?.apkUrl) setApkUrl(manifest.apkUrl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!affected || !apkUrl) return null;

  return (
    <a
      href={apkUrl}
      download
      className="mx-auto mb-4 flex w-full max-w-7xl items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-start text-sm font-bold text-foreground transition-safe hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <span className="min-w-0 flex-1">
        <span className="block">يتوفَّر تحديث للتطبيق</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          اضغط لتنزيل الإصدار الجديد وتثبيته.
        </span>
      </span>
      <span aria-hidden="true" className="text-primary">
        ←
      </span>
    </a>
  );
}
