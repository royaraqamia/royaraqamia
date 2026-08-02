'use client';

import { useState, type FormEvent, useRef, useEffect } from 'react';
import { verifyCertificate } from '@/backend/actions/certificates/verify';
import { CERT_CODE_REGEX } from '@/backend/services/certificate-verification';
import { m, AnimatePresence } from 'motion/react';
import { containerVariants, resultVariants } from '@/frontend/ui/verify/verify-variants';
import { VerifyHero } from '@/frontend/ui/verify/verify-hero';
import { VerifySearchCard } from '@/frontend/ui/verify/verify-search-card';
import { VerifyLoadingState } from '@/frontend/ui/verify/verify-loading-state';
import { VerifyErrorState } from '@/frontend/ui/verify/verify-error-state';
import { VerifyTrustFooter } from '@/frontend/ui/verify/verify-trust-footer';
import { CertificateResultCard } from '@/frontend/ui/verify/certificate-result-card';
import type { Certificate } from '@/shared/contracts/certificates';

export default function VerifyPage() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    certificate?: Certificate;
    error?: string;
    rateLimited?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isValidFormat, setIsValidFormat] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (code.length >= 5) {
      setIsValidFormat(CERT_CODE_REGEX.test(code.toUpperCase()));
    } else {
      setIsValidFormat(null);
    }
  }, [code]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await verifyCertificate(code);
      setResult(data);
    } catch {
      setResult({ success: false, error: 'حدث خطأ غير مُتوقَّع. الرَّجاء المحاولة مرَّة أخرى.' });
    } finally {
      setLoading(false);
    }
  }

  function copyCode(val: string) {
    navigator.clipboard.writeText(val);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* Dynamic Background Grid & Glowing Lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] bg-size-[24px_24px] opacity-30" />
        <m.div
          className="absolute -top-32 right-1/4 h-125 w-125 rounded-full bg-linear-to-br from-indigo-500/15 via-purple-500/10 to-transparent blur-3xl"
          animate={{ scale: [1, 1.15, 1], x: [0, 25, 0], y: [0, -15, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
        <m.div
          className="absolute -bottom-32 left-1/4 h-112.5 w-112.5 rounded-full bg-linear-to-tr from-violet-500/15 via-fuchsia-500/10 to-transparent blur-3xl"
          animate={{ scale: [1, 1.2, 1], x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 md:py-20 lg:py-24">
        <m.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          <VerifyHero />

          <VerifySearchCard
            code={code}
            isValidFormat={isValidFormat}
            loading={loading}
            inputRef={inputRef}
            onCodeChange={setCode}
            onSubmit={handleSubmit}
            onSampleClick={() => {
              setCode('COMP-2026-UHVW9SG5');
              inputRef.current?.focus();
            }}
          />

          {/* Loading Indicator State */}
          <AnimatePresence>{loading && <VerifyLoadingState />}</AnimatePresence>

          {/* Error / Rate Limited State */}
          <AnimatePresence>
            {!loading && result && !result.success && (
              <VerifyErrorState
                rateLimited={result.rateLimited}
                error={result.error}
                onRetry={() => {
                  setResult(null);
                  setCode('');
                  inputRef.current?.focus();
                }}
              />
            )}
          </AnimatePresence>

          {/* Success Result State */}
          <AnimatePresence>
            {!loading && result?.success && result.certificate && (
              <m.div
                key="success"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -20, transition: { duration: 0.15 } }}
                className="my-6"
              >
                <CertificateResultCard
                  certificate={result.certificate}
                  copied={copied}
                  onCopy={copyCode}
                />
              </m.div>
            )}
          </AnimatePresence>

          <VerifyTrustFooter />
        </m.div>
      </div>
    </main>
  );
}
