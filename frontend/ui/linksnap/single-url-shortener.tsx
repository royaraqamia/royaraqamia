'use client';

import React, { useReducer } from 'react';
import NextLink from 'next/link';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { Copy, Check, Share2, QrCode, RotateCcw, LockOpen, CloudOff } from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { hslToHex } from '@/frontend/shared/hsl-to-hex';
import { toast } from 'sonner';
import { useShortenLink } from '@/frontend/state/linksnap/use-shorten';
import { useSlugAvailability } from '@/frontend/state/linksnap/use-slug-availability';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { SINGLE_URL_SHORTENER_COPY } from './single-url-shortener-copy';
import { shortenerInitialState, shortenerReducer } from './single-url-shortener.reducer';

interface SingleUrlShortenerProps {
  token: string | null;
  onLinkCreated?: () => void;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function SingleUrlShortener({ token, onLinkCreated }: SingleUrlShortenerProps) {
  const reducedMotion = useReducedMotion();
  const { shorten, loading, error, setError } = useShortenLink(token);
  const [form, dispatch] = useReducer(shortenerReducer, undefined, shortenerInitialState);
  const { originalUrl, customCode, password, shortenedUrl, copied, showQr, qrDataUrl } = form;
  const { status: slugStatus, error: slugError } = useSlugAvailability(customCode, token);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'submitted' });

    if (!isValidUrl(originalUrl)) {
      setError(SINGLE_URL_SHORTENER_COPY.invalidUrl);
      return;
    }

    const link = await shorten(originalUrl, customCode, password || undefined);
    if (!link) return;

    const generatedCode = link.code;
    dispatch({ type: 'shortened', url: `${getBaseUrl()}/${generatedCode}` });
    onLinkCreated?.();
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue('--primary').trim();
    const accent = style.getPropertyValue('--accent').trim();
    const warning = style.getPropertyValue('--warning').trim();
    const { default: confetti } = await import('canvas-confetti');
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.5, x: 0.5 },
      startVelocity: 20,
      colors: [`hsl(${primary})`, `hsl(${accent})`, `hsl(${warning})`],
    });
  };

  const copyToClipboard = async () => {
    if (!shortenedUrl) return;
    try {
      await navigator.clipboard.writeText(shortenedUrl);
      dispatch({ type: 'copyRaised' });
      toast.success(SINGLE_URL_SHORTENER_COPY.copySuccessToast);
      setTimeout(() => dispatch({ type: 'copyCleared' }), 2000);
    } catch (err) {
      logger.error('Failed to copy text', { error: String(err) });
      toast.error(SINGLE_URL_SHORTENER_COPY.copyFailedToast);
    }
  };

  const shareUrl = async () => {
    if (!shortenedUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: SINGLE_URL_SHORTENER_COPY.shareTitle,
          url: shortenedUrl,
        });
        toast.success(SINGLE_URL_SHORTENER_COPY.shareSuccessToast);
      } else {
        copyToClipboard();
      }
    } catch (err) {
      logger.error('Error sharing', { error: String(err) });
    }
  };

  const toggleQr = async () => {
    if (showQr) {
      dispatch({ type: 'qrHidden' });
      return;
    }
    if (!qrDataUrl && shortenedUrl) {
      try {
        const style = getComputedStyle(document.documentElement);
        const dark = hslToHex(style.getPropertyValue('--foreground').trim());
        const light = hslToHex(style.getPropertyValue('--background').trim());
        const { default: QRCode } = await import('qrcode');
        const dataUrl = await QRCode.toDataURL(shortenedUrl, {
          width: 180,
          margin: 1,
          errorCorrectionLevel: 'M',
          color: { dark: dark ?? '#000000', light: light ?? '#ffffff' },
        });
        dispatch({ type: 'qrLoaded', dataUrl });
      } catch {
        return;
      }
    }
    dispatch({ type: 'qrShown' });
  };

  const resetForm = () => {
    dispatch({ type: 'reset' });
    // The failure text lives in the shorten hook, so only it can clear it.
    setError(null);
  };

  return (
    <AnimatePresence mode="wait">
      {!shortenedUrl ? (
        <m.form
          key="input-form"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onSubmit={handleShorten}
          className="space-y-5"
        >
          <div>
            <label
              htmlFor="original-url"
              data-visual="label"
              className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2"
            >
              {SINGLE_URL_SHORTENER_COPY.urlLabel}
            </label>
            <input
              id="original-url"
              type="url"
              dir="ltr"
              required
              value={originalUrl}
              onChange={(e) => dispatch({ type: 'urlChanged', url: e.target.value })}
              placeholder={SINGLE_URL_SHORTENER_COPY.urlPlaceholder}
              autoFocus
              aria-describedby="single-url-error"
              data-visual="input"
              className="w-full px-4 py-3.5 bg-muted/50 border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-safe text-foreground"
            />
          </div>

          {!token && (
            <p data-visual="hint" className="text-xs text-muted-foreground font-medium">
              {SINGLE_URL_SHORTENER_COPY.guestHint}{' '}
              <NextLink
                href="/auth/login?redirect=%2Flinksnap"
                className="font-bold text-primary hover:underline"
              >
                {SINGLE_URL_SHORTENER_COPY.guestSignIn}
              </NextLink>
            </p>
          )}

          {token && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-1.5"
            >
              <label
                htmlFor="custom-code"
                data-visual="custom-label"
                className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1"
              >
                {SINGLE_URL_SHORTENER_COPY.customLabel}
              </label>
              <div
                data-visual="custom-field"
                className="flex items-center w-full overflow-hidden bg-muted/50 border border-border rounded-full transition-safe"
                dir="ltr"
              >
                <span className="shrink-0 px-3 text-sm text-muted-foreground font-bold select-none whitespace-nowrap py-3.5 leading-snug">
                  {getBaseUrl()}/
                </span>
                <input
                  id="custom-code"
                  type="text"
                  value={customCode}
                  onChange={(e) => dispatch({ type: 'codeChanged', code: e.target.value })}
                  placeholder={SINGLE_URL_SHORTENER_COPY.customPlaceholder}
                  maxLength={16}
                  className="flex-1 min-w-0 bg-transparent px-3 py-3.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <p data-visual="custom-hint" className="text-xs text-muted-foreground font-medium">
                {SINGLE_URL_SHORTENER_COPY.customHint}
              </p>
              {slugStatus !== 'idle' && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-1.5 text-xs font-bold ${
                    slugStatus === 'checking' || slugStatus === 'offline'
                      ? 'text-muted-foreground'
                      : slugStatus === 'available'
                        ? 'text-success'
                        : 'text-destructive'
                  }`}
                >
                  {slugStatus === 'checking' ? (
                    <>
                      <span
                        className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
                        aria-hidden="true"
                      />
                      <span>{SINGLE_URL_SHORTENER_COPY.checking}</span>
                    </>
                  ) : slugStatus === 'available' ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{SINGLE_URL_SHORTENER_COPY.available}</span>
                    </>
                  ) : slugStatus === 'offline' ? (
                    <>
                      <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{SINGLE_URL_SHORTENER_COPY.offline}</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">✕</span>
                      <span>{slugError ?? SINGLE_URL_SHORTENER_COPY.takenFallback}</span>
                    </>
                  )}
                </div>
              )}

              <div className="pt-2">
                <label
                  htmlFor="link-password"
                  data-visual="password-label"
                  className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1"
                >
                  {SINGLE_URL_SHORTENER_COPY.passwordLabel}
                </label>
                <input
                  id="link-password"
                  data-visual="password-field"
                  type="password"
                  value={password}
                  onChange={(e) => dispatch({ type: 'passwordChanged', password: e.target.value })}
                  placeholder={SINGLE_URL_SHORTENER_COPY.passwordPlaceholder}
                  autoComplete="new-password"
                  className="w-full px-4 py-3 bg-muted/50 border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-safe text-foreground"
                />
              </div>
            </m.div>
          )}

          {error && (
            <m.div
              id="single-url-error"
              role="alert"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg font-medium"
            >
              {error}
            </m.div>
          )}

          <HeroCtaButton
            id="btn-shorten-url"
            type="submit"
            data-visual="submit"
            className="w-full"
            disabled={loading || !originalUrl}
          >
            {loading ? (
              <>
                <div
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"
                  role="status"
                />
                <span>{SINGLE_URL_SHORTENER_COPY.busySubmit}</span>
              </>
            ) : (
              <span>{SINGLE_URL_SHORTENER_COPY.submit}</span>
            )}
          </HeroCtaButton>
        </m.form>
      ) : (
        <m.div
          key="success-view"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
          className="text-center py-4 space-y-6"
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-3 stroke-primary fill-none">
                <m.path
                  d="M5 13l4 4L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.4, ease: [0.33, 1, 0.68, 1] }}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="text-xl font-display font-bold text-foreground">
              {SINGLE_URL_SHORTENER_COPY.readyTitle}
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm truncate">
              {SINGLE_URL_SHORTENER_COPY.redirectLead}{' '}
              <span className="text-primary">{originalUrl}</span>
            </p>
            {password && (
              <p className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                <LockOpen aria-hidden="true" className="w-3.5 h-3.5" />
                {SINGLE_URL_SHORTENER_COPY.protectedBadge}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/50 border border-border rounded-full select-all">
            <input
              type="text"
              readOnly
              value={shortenedUrl}
              className="flex-1 bg-transparent border-none text-sm text-foreground text-center font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={copyToClipboard}
              className="py-3 px-4 bg-muted/50 hover:bg-muted text-foreground border border-border font-medium text-xs rounded-full transition-safe flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" className="w-4 h-4 text-success" />
                  <span className="text-success font-bold">
                    {SINGLE_URL_SHORTENER_COPY.copiedAction}
                  </span>
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  <span>{SINGLE_URL_SHORTENER_COPY.copyAction}</span>
                </>
              )}
            </button>

            <button
              onClick={shareUrl}
              className="py-3 px-4 bg-muted/50 hover:bg-muted text-foreground border border-border font-medium text-xs rounded-full transition-safe flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
            >
              <Share2 aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              <span>{SINGLE_URL_SHORTENER_COPY.shareAction}</span>
            </button>

            <button
              onClick={toggleQr}
              className={`py-3 px-4 font-medium text-xs rounded-full border transition-safe flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press ${
                showQr
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 hover:bg-muted text-foreground border-border'
              }`}
            >
              <QrCode
                aria-hidden="true"
                className={`w-4 h-4 ${showQr ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span>{SINGLE_URL_SHORTENER_COPY.qrAction}</span>
            </button>
          </div>

          <AnimatePresence>
            {showQr && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-2xl border border-primary/20"
              >
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt={SINGLE_URL_SHORTENER_COPY.qrImageAlt}
                    width={180}
                    height={180}
                    className="w-44 h-44 bg-background p-2 rounded-full shadow-inner border border-primary/20"
                  />
                )}
                <p className="text-xs text-primary font-bold mt-2.5">
                  {SINGLE_URL_SHORTENER_COPY.qrHint}
                </p>
              </m.div>
            )}
          </AnimatePresence>

          <button
            onClick={resetForm}
            className="w-full py-3 bg-muted/50 hover:bg-muted border border-border text-muted-foreground text-xs font-bold rounded-full transition-safe flex items-center justify-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            <span>{SINGLE_URL_SHORTENER_COPY.againAction}</span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
