'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, FileText, AlertCircle, ArrowLeft, Copy, Check, RefreshCw } from 'lucide-react';
import { getBaseUrl } from '@/lib/utils';
import { toast } from 'sonner';

interface BulkShortenResultItem {
  originalUrl: string;
  shortLink?: { code: string };
  error?: string;
}

interface BulkUrlShortenerProps {
  token: string | null;
  onLinkCreated: () => void;
}

export function BulkUrlShortener({ token, onLinkCreated }: BulkUrlShortenerProps) {
  const [bulkUrls, setBulkUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BulkShortenResultItem[] | null>(null);
  const [copiedIndexes, setCopiedIndexes] = useState<Record<number, boolean>>({});
  const [allCopied, setAllCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults(null);
    setCopiedIndexes({});
    setAllCopied(false);

    const parsedUrls = bulkUrls
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (parsedUrls.length === 0) {
      setError('يرجى إدخال رابط صالح واحد على الأقل.');
      setLoading(false);
      return;
    }

    if (parsedUrls.length > 50) {
      setError('الاختصار بالجملة محدود بـ 50 رابطًا لكل دفعة لمنع إساءة استخدام الخادم.');
      setLoading(false);
      return;
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/linksnap/api/shorten/bulk', {
        method: 'POST',
        headers,
        body: JSON.stringify({ urls: parsedUrls }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'فشل في اختصار الروابط');

      setResults(data.results || []);
      onLinkCreated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء الاختصار بالجملة.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string, index: number) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedIndexes((prev) => ({ ...prev, [index]: true }));
      toast.success('تم نسخ الرابط!');
      setTimeout(() => setCopiedIndexes((prev) => ({ ...prev, [index]: false })), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
      toast.error('فشل نسخ الرابط');
    }
  };

  const copyAllToClipboard = async () => {
    if (!results) return;
    const allLinks = results
      .filter((r) => r.shortLink)
      .map((r) => `${getBaseUrl()}/${r.shortLink!.code}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(allLinks);
      setAllCopied(true);
      toast.success(`تم نسخ ${successCount} رابط!`);
      setTimeout(() => setAllCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy all:', err);
      toast.error('فشل نسخ الروابط');
    }
  };

  const resetForm = () => {
    setBulkUrls('');
    setResults(null);
    setError(null);
    setCopiedIndexes({});
    setAllCopied(false);
  };

  const successCount = results ? results.filter((r) => r.shortLink).length : 0;
  const failCount = results ? results.filter((r) => r.error).length : 0;

  return (
    <AnimatePresence mode="wait">
      {!results ? (
        <motion.form
          key="bulk-form"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div>
            <div className="flex justify-between items-center mb-2">
              <label
                htmlFor="bulk-urls"
                className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
              >
                أدخل الروابط الوجهة (واحد لكل سطر)
              </label>
              <span className="text-xs bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2.5 py-1 rounded-full font-bold">
                الحد الأقصى: 50 رابطًا
              </span>
            </div>
            <div className="relative">
              <FileText
                aria-hidden="true"
                className="absolute right-4 top-4 w-5 h-5 text-indigo-400"
              />
              <textarea
                id="bulk-urls"
                required
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="https://google.com&#10;https://github.com&#10;https://example.com"
                rows={6}
                className="w-full pr-12 pl-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-slate-800 dark:text-slate-200 leading-relaxed resize-y"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              aria-live="polite"
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-600 dark:text-red-400 text-xs rounded-lg font-medium flex items-start gap-2"
            >
              <AlertCircle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !bulkUrls.trim()}
            className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer group press-scale focus-ring"
          >
            {loading ? (
              <>
                <div
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"
                  role="status"
                />
                <span>جاري اختصار الروابط...</span>
              </>
            ) : (
              <>
                <Layers
                  aria-hidden="true"
                  className="w-4 h-4 text-indigo-200 group-hover:scale-110 transition-transform"
                />
                <span>اختصار القائمة بالجملة</span>
                <ArrowLeft aria-hidden="true" className="w-4 h-4 mr-1" />
              </>
            )}
          </button>
        </motion.form>
      ) : (
        <motion.div
          key="bulk-results-view"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <Check aria-hidden="true" className="w-4 h-4 text-emerald-500 stroke-3" />
              <span>اكتمل الاختصار بالجملة</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                نجاح {successCount}
                {failCount > 0 ? `، فشل ${failCount}` : ''}
              </span>
            </div>
          </div>

          {successCount > 0 && (
            <button
              onClick={copyAllToClipboard}
              className="w-full py-2.5 bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer press-scale focus-ring"
            >
              {allCopied ? (
                <>
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">تم نسخ الكل!</span>
                </>
              ) : (
                <>
                  <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                  <span>نسخ جميع الروابط المختصرة</span>
                </>
              )}
            </button>
          )}

          <div className="relative border border-slate-100 dark:border-slate-700 rounded-xl text-xs overflow-x-auto">
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-semibold sticky top-0">
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      الوجهة الأصلية
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      الرابط المختصر
                    </th>
                    <th scope="col" className="px-3 py-2 text-center font-semibold w-12">
                      نسخ
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {results.map((res: BulkShortenResultItem, index: number) => {
                    const hasError = !!res.error;
                    const shortFull = res.shortLink ? `${getBaseUrl()}/${res.shortLink.code}` : '';
                    return (
                      <tr key={index} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                        <td className="px-3 py-2 max-w-[140px] sm:max-w-[200px] truncate text-slate-600 dark:text-slate-400 font-mono">
                          {res.originalUrl}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold">
                          {hasError ? (
                            <span className="text-red-500 dark:text-red-400 font-sans font-normal text-xs bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-md">
                              {res.error}
                            </span>
                          ) : (
                            <a
                              href={shortFull}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-600 hover:underline"
                            >
                              /{res.shortLink!.code}
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!hasError && (
                            <button
                              onClick={() => copyToClipboard(shortFull, index)}
                              aria-label="نسخ الرابط"
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all cursor-pointer focus-ring"
                            >
                              {copiedIndexes[index] ? (
                                <Check
                                  aria-hidden="true"
                                  className="w-3.5 h-3.5 text-emerald-600"
                                />
                              ) : (
                                <Copy aria-hidden="true" className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {results.length > 5 && (
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-linear-to-t from-slate-50 dark:from-slate-800 to-transparent pointer-events-none" />
            )}
          </div>

          <button
            onClick={resetForm}
            className="w-full py-3 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer press-scale focus-ring"
          >
            <RefreshCw
              aria-hidden="true"
              className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400"
            />
            <span>اختصار دفعة أخرى</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
