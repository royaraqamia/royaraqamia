'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Link, Sparkles, Copy, Check, Share2, QrCode, ArrowLeft, RotateCcw } from 'lucide-react';
import { logger } from '@/frontend/shared/logger';
import { getBaseUrl } from '@/frontend/shared/get-base-url';
import { hslToHex } from '@/frontend/shared/hsl-to-hex';
import { toast } from 'sonner';
import { useShortenLink } from '@/frontend/state/linksnap/use-shorten';
import { useSlugAvailability } from '@/frontend/state/linksnap/use-slug-availability';

interface SingleUrlShortenerProps {
  token: string | null;
  onLinkCreated: () => void;
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
  const [originalUrl, setOriginalUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [shortenedUrl, setShortenedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const { status: slugStatus, error: slugError } = useSlugAvailability(customCode, token);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setShortenedUrl(null);
    setShowQr(false);
    setQrDataUrl(null);

    if (!isValidUrl(originalUrl)) {
      setError('يرجى إدخال رابط صحيح يبدأ بـ http:// أو https://');
      return;
    }

    const link = await shorten(originalUrl, customCode);
    if (!link) return;

    const generatedCode = link.code;
    setShortenedUrl(`${getBaseUrl()}/${generatedCode}`);
    onLinkCreated();
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
      setCopied(true);
      toast.success('تم نسخ الرابط!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy text', { error: String(err) });
      toast.error('فشل نسخ الرابط');
    }
  };

  const shareUrl = async () => {
    if (!shortenedUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'رابط مُختصَر من LinkSnap', url: shortenedUrl });
        toast.success('تمت المشاركة!');
      } else {
        copyToClipboard();
      }
    } catch (err) {
      logger.error('Error sharing', { error: String(err) });
    }
  };

  const toggleQr = async () => {
    if (showQr) {
      setShowQr(false);
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
        setQrDataUrl(dataUrl);
      } catch {
        return;
      }
    }
    setShowQr(true);
  };

  const resetForm = () => {
    setOriginalUrl('');
    setCustomCode('');
    setShortenedUrl(null);
    setError(null);
    setShowQr(false);
    setQrDataUrl(null);
  };

  return (
    <AnimatePresence mode="wait">
      {!shortenedUrl ? (
        <motion.form
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
              className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
            >
              الرَّابط
            </label>
            <div className="relative">
              <Link
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-primary"
              />
              <input
                id="original-url"
                type="url"
                required
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://example.com/very-long-url-path"
                autoFocus
                aria-describedby="single-url-error"
                className="w-full pr-12 pl-4 py-3.5 bg-muted/50 border border-border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
              />
            </div>
          </div>

          {token && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-1.5"
            >
              <label
                htmlFor="custom-code"
                className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
              >
                رمز مُخصَّص (اختياري)
              </label>
              <div
                className="flex items-center w-full overflow-hidden bg-muted/50 border border-border rounded-full focus-within:ring-2 focus-within:ring-primary/20 transition-all"
                dir="ltr"
              >
                <span className="shrink-0 pr-3 text-sm text-muted-foreground font-semibold select-none whitespace-nowrap py-3.5 leading-snug">
                  {getBaseUrl()}/
                </span>
                <input
                  id="custom-code"
                  type="text"
                  value={customCode}
                  onChange={(e) =>
                    setCustomCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16))
                  }
                  placeholder="my-promo"
                  maxLength={16}
                  className="flex-1 min-w-0 bg-transparent px-3 py-3.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground"
                />
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                3-16 حرفاً (أحرف، أرقام، - و _)
              </p>
              {slugStatus !== 'idle' && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-1.5 text-xs font-semibold ${
                    slugStatus === 'checking'
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
                      <span>جاري التحقق من التوفر...</span>
                    </>
                  ) : slugStatus === 'available' ? (
                    <>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>هذا الرمز متاح!</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">✕</span>
                      <span>{slugError}</span>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {error && (
            <motion.div
              id="single-url-error"
              role="alert"
              initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg font-medium"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !originalUrl}
            className="w-full py-4 px-6 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-full transition-all shadow-md shadow-primary/20 hover:shadow-primary/30 flex items-center justify-center gap-2 cursor-pointer group btn-lift focus-ring touch-target btn-press"
          >
            {loading ? (
              <>
                <div
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"
                  role="status"
                />
                <span>جاري الاختصار...</span>
              </>
            ) : (
              <>
                <Sparkles
                  aria-hidden="true"
                  className="w-4 h-4 text-primary-foreground/60 group-hover:scale-110 transition-transform"
                />
                <span>اختصار الرَّابط</span>
                <ArrowLeft aria-hidden="true" className="w-4 h-4 ms-1" />
              </>
            )}
          </button>
        </motion.form>
      ) : (
        <motion.div
          key="success-view"
          initial={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.95 }}
          className="text-center py-4 space-y-6"
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-2">
              <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-3 stroke-primary fill-none">
                <motion.path
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
              رابطك المُختصَر جاهز!
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm truncate">
              يُعيد التَّوجيه إلى: <span className="text-primary">{originalUrl}</span>
            </p>
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
              className="py-3 px-4 bg-muted/50 hover:bg-muted text-foreground border border-border font-medium text-xs rounded-full transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" className="w-4 h-4 text-success" />
                  <span className="text-success font-semibold">تمَّ النَّسخ!</span>
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                  <span>نسخ الرَّابط</span>
                </>
              )}
            </button>

            <button
              onClick={shareUrl}
              className="py-3 px-4 bg-muted/50 hover:bg-muted text-foreground border border-border font-medium text-xs rounded-full transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
            >
              <Share2 aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
              <span>مشاركة الرَّابط</span>
            </button>

            <button
              onClick={toggleQr}
              className={`py-3 px-4 font-medium text-xs rounded-full border transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press ${
                showQr
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 hover:bg-muted text-foreground border-border'
              }`}
            >
              <QrCode
                aria-hidden="true"
                className={`w-4 h-4 ${showQr ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span>رمز الاستجابة السَّريعة</span>
            </button>
          </div>

          <AnimatePresence>
            {showQr && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-2xl border border-primary/20"
              >
                {qrDataUrl && (
                  <img
                    src={qrDataUrl}
                    alt="QR code for shortened URL"
                    width={180}
                    height={180}
                    className="w-44 h-44 bg-background p-2 rounded-full shadow-inner border border-primary/20"
                  />
                )}
                <p className="text-xs text-primary font-semibold mt-2.5">
                  امسح لعرض الرَّابط المُختصَر
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={resetForm}
            className="w-full py-3 bg-muted/50 hover:bg-muted border border-border text-muted-foreground text-xs font-semibold rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer press-scale focus-ring touch-target btn-press"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            <span>اختصار رابط آخر</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
