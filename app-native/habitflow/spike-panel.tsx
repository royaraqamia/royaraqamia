'use client';

/**
 * The spike's own chrome (issue #500). It is not product UI and is deleted with
 * the spike: three controls, one of each thing the veto table asks about, so a
 * device session can answer the rows without a laptop attached.
 *
 *   * sign in — a Bearer session in the bundled origin, nothing else
 *   * probes — what the live server answers for that token (see `./probes`)
 *   * crossing — leave for `/community` through the chosen mechanism, and the
 *     `appUrlOpen` events that came back (deep links, the OAuth return trip)
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

import { Button } from '@/frontend/ui/primitives/button';

import { openRemote, remoteMechanism, setRemoteMechanism, type RemoteMechanism } from './crossing';
import { runProbes, type ProbeResult } from './probes';
import { restoreSession, signIn, signOut, spikeSession, subscribeToSpikeSession } from './session';

interface DeepLink {
  url: string;
  at: string;
}

const MECHANISMS: { value: RemoteMechanism; label: string }[] = [
  { value: 'webview', label: 'نفس WebView' },
  { value: 'custom-tab', label: 'Custom Tab' },
];

export function SpikePanel() {
  const session = useSyncExternalStore(subscribeToSpikeSession, spikeSession, () => null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [mechanism, setMechanism] = useState<RemoteMechanism>(() => remoteMechanism());
  const [links, setLinks] = useState<DeepLink[]>([]);

  // A refresh token left by an earlier launch is a session; mint from it once.
  useEffect(() => {
    void restoreSession();
  }, []);

  // Every return trip into the app — a deep link, the OAuth callback — lands
  // here. The panel keeps the last few so the device session can read them off.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let dispose: (() => Promise<void>) | undefined;
    void App.addListener('appUrlOpen', (event) => {
      setLinks((previous) =>
        [{ url: event.url, at: new Date().toLocaleTimeString('ar') }, ...previous].slice(0, 5)
      );
    }).then((handle) => {
      dispose = () => handle.remove();
    });

    return () => {
      void dispose?.();
    };
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleProbe() {
    setBusy(true);
    try {
      setResults(await runProbes());
    } finally {
      setBusy(false);
    }
  }

  async function handleMechanism(next: RemoteMechanism) {
    await setRemoteMechanism(next);
    setMechanism(next);
  }

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <section
      dir="rtl"
      data-spike-panel="true"
      className="border-border bg-card text-card-foreground mx-auto mt-10 mb-16 w-full max-w-3xl space-y-5 rounded-2xl border p-5 text-sm shadow-lg"
    >
      <header className="space-y-1">
        <h2 className="text-base font-semibold">مِسبار الأصلين (500)</h2>
        <p className="text-muted-foreground">
          الأصل الحالي: <span data-spike-origin="true">{origin}</span>
        </p>
      </header>

      <div className="space-y-2">
        <p className="font-medium">الجلسة (Bearer فقط)</p>
        {session ? (
          <div className="space-y-2">
            <p data-spike-session="signed-in">مسجّل الدخول: {session.email || session.userId}</p>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              خروج
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="البريد"
              autoComplete="username"
              dir="ltr"
              className="border-border bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="كلمة المرور"
              autoComplete="current-password"
              dir="ltr"
              className="border-border bg-background focus-visible:ring-ring w-full rounded-lg border px-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
            />
            <Button size="sm" disabled={busy} onClick={() => void handleSignIn()}>
              دخول
            </Button>
          </div>
        )}
        {error ? (
          <p className="text-destructive" data-spike-error="true">
            {error}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">فحص الرمز على الخادم</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleProbe()}>
            تشغيل
          </Button>
        </div>
        <ul className="space-y-1">
          {results.map((result) => (
            <li key={result.path} dir="ltr" className="text-muted-foreground font-mono text-xs">
              {result.path} → {String(result.status)} {result.detail ? `· ${result.detail}` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="font-medium">الانتقال إلى سطح بعيد</p>
        <div className="flex flex-wrap gap-2">
          {MECHANISMS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={mechanism === option.value ? 'default' : 'outline'}
              onClick={() => void handleMechanism(option.value)}
            >
              {option.label}
            </Button>
          ))}
          <Button size="sm" onClick={() => void openRemote('/community', '', mechanism)}>
            فتح /community
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <p className="font-medium">روابط عائدة إلى التطبيق</p>
        {links.length === 0 ? (
          <p className="text-muted-foreground">
            {Capacitor.isNativePlatform()
              ? 'لا شيء بعد — افتح رابطاً من الخارج أو عد من تسجيل الدخول.'
              : 'غير متاح في المتصفح.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={`${link.at}-${link.url}`} dir="ltr" className="font-mono text-xs">
                {link.at} · {link.url}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
