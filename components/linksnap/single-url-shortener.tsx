'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, Sparkles, Copy, Check, Share2, QrCode, ArrowLeft, RotateCcw } from 'lucide-react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { getBaseUrl } from '@/domains/linksnap/lib/utils';
import { toast } from 'sonner';

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
  const [originalUrl, setOriginalUrl] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortenedUrl, setShortenedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const handleShorten = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShortenedUrl(null);
    setShowQr(false);
    setQrDataUrl(null);

    if (!isValidUrl(originalUrl)) {
      setError('يرجى إدخال رابط صحيح يبدأ بـ http:// أو https://');
      return;
    }

    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/shorten', {
        method: 'POST',
        headers,
        body: JSON.stringify({ originalUrl, customCode: customCode || undefined }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في اختصار الرَّابط');

      const generatedCode = data.link.code;
      setShortenedUrl(`${getBaseUrl()}/${generatedCode}`);
      onLinkCreated();
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.5, x: 0.5 },
        startVelocity: 20,
        colors: ['#6366f1', '#818cf8', '#a5b4fc', '#f59e0b'],
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء اختصار الرَّابط.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shortenedUrl) return;
    try {
      await navigator.clipboard.writeText(shortenedUrl);
      setCopied(true);
      toast.success('تم نسخ الرابط!');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
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
      console.error('Error sharing:', err);
    }
  };

  const toggleQr = async () => {
    if (showQr) {
      setShowQr(false);
      return;
    }
    if (!qrDataUrl && shortenedUrl) {
      try {
        const dataUrl = await QRCode.toDataURL(shortenedUrl, {
          width: 180,
          margin: 1,
          color: { dark: '#1e293b', light: '#ffffff' },
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
              className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
            >
              الرَّابط
            </label>
            <div className="relative">
              <Link
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-500"
              />
              <input
                id="original-url"
                type="url"
                required
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://example.com/very-long-url-path"
                className="w-full pr-12 pl-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-200"
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
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1"
              >
                رمز مُخصَّص (اختياري)
              </label>
              <div
                className="flex items-center bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition-all"
                dir="ltr"
              >
                <span className="shrink-0 pr-3 text-sm text-slate-500 dark:text-slate-400 font-semibold select-none whitespace-nowrap py-3.5 leading-snug">
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
                  className="flex-1 bg-transparent px-3 py-3.5 text-sm focus:outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                3-16 حرفاً (أحرف، أرقام، - و _)
              </p>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg font-medium"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !originalUrl}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-indigo-100 hover:shadow-indigo-200 flex items-center justify-center gap-2 disabled:bg-indigo-400 disabled:shadow-none cursor-pointer group press-scale focus-ring"
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
                  className="w-4 h-4 text-indigo-200 group-hover:scale-110 transition-transform"
                />
                <span>اختصار الرَّابط</span>
                <ArrowLeft aria-hidden="true" className="w-4 h-4 mr-1" />
              </>
            )}
          </button>
        </motion.form>
      ) : (
        <motion.div
          key="success-view"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="text-center py-4 space-y-6"
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2">
              <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-[3] stroke-indigo-600 fill-none">
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
            <h3 className="text-xl font-display font-bold text-slate-800 dark:text-slate-100">
              رابطك المُختصَر جاهز!
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm truncate">
              يُعيد التَّوجيه إلى: <span className="text-indigo-600">{originalUrl}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700 rounded-xl select-all">
            <input
              type="text"
              readOnly
              value={shortenedUrl}
              className="flex-1 bg-transparent border-none text-sm text-slate-800 dark:text-slate-200 text-center font-bold focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={copyToClipboard}
              className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium text-xs rounded-xl transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring"
            >
              {copied ? (
                <>
                  <Check aria-hidden="true" className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-600 font-semibold">تمَّ النَّسخ!</span>
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                  <span>نسخ الرَّابط</span>
                </>
              )}
            </button>

            <button
              onClick={shareUrl}
              className="py-3 px-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium text-xs rounded-xl transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring"
            >
              <Share2 aria-hidden="true" className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>مشاركة الرَّابط</span>
            </button>

            <button
              onClick={toggleQr}
              className={`py-3 px-4 font-medium text-xs rounded-xl border transition-all flex flex-col items-center gap-1.5 cursor-pointer press-scale focus-ring ${
                showQr
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                  : 'bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
              }`}
            >
              <QrCode
                aria-hidden="true"
                className={`w-4 h-4 ${showQr ? 'text-indigo-600' : 'text-slate-500 dark:text-slate-400'}`}
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
                className="flex flex-col items-center justify-center p-4 bg-indigo-50/50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30"
              >
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrDataUrl}
                    alt="QR code for shortened URL"
                    width={180}
                    height={180}
                    className="w-44 h-44 bg-white dark:bg-slate-900 p-2 rounded-xl shadow-inner border border-indigo-100/30"
                  />
                )}
                <p className="text-[10px] text-indigo-600 font-semibold mt-2.5">
                  امسح لعرض الرَّابط المُختصَر
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={resetForm}
            className="w-full py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer press-scale focus-ring"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            <span>اختصار رابط آخر</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
