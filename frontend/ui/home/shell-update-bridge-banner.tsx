'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { openInSystemBrowser } from '@/frontend/shared/native-shell';
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
 *
 * The hand-off goes through the system browser: this app's WebView has no
 * DownloadListener, so a same-origin `download` link is ignored. The Capacitor
 * plugin is tried first, then the WebView's own `_system` target (which needs no
 * injected bridge), then an ordinary navigation as the last resort.
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

  const open = async () => {
    if (await openInSystemBrowser(apkUrl)) return;
    const external = window.open(apkUrl, '_system');
    if (!external) window.location.assign(apkUrl);
  };

  return (
    <div
      role="status"
      className="relative mx-auto mb-5 w-full max-w-7xl overflow-hidden rounded-2xl border border-primary/30 bg-linear-to-br from-primary/12 via-primary/6 to-accent-indigo/10 p-4 shadow-lg shadow-primary/5 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25"
          >
            <Download className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-snug text-foreground sm:text-base">
              تحديث التطبيق جاهز
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
              ثبِّت الإصدار الجديد مرة واحدة؛ بعدها ستأتي التحديثات من داخل التطبيق.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="hero"
          size="sm"
          onClick={() => void open()}
          className="w-full sm:w-auto"
        >
          تنزيل وتثبيت
          <Download aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}
