'use client';

import '@/app/verify/app.css';
import { useState, type FormEvent, useRef, useEffect } from 'react';
import { verifyCertificateAttempt } from '@/frontend/api/certificates';
import { CERT_CODE_REGEX, type PublicCertificate } from '@/shared/contracts/certificates';
import { m, AnimatePresence } from 'motion/react';
import { containerVariants, resultVariants } from '@/frontend/ui/verify/verify-variants';
import { VerifySearchCard } from '@/frontend/ui/verify/verify-search-card';
import { VerifyLoadingState } from '@/frontend/ui/verify/verify-loading-state';
import { VerifyErrorState } from '@/frontend/ui/verify/verify-error-state';
import { CertificateResultCard } from '@/frontend/ui/verify/certificate-result-card';
import { Certificate } from '@/frontend/ui/Certificate';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { VERIFY_COPY } from './verify-copy';

/**
 * What the page is showing, as one value rather than four flags (#658).
 *
 * The app draws the same six states from `VerifyUiState`, and `docs/mobile/
 * parity.json` holds the pair, so a state added on one side is a failing check on
 * the other. `unreachable` is its own state rather than an error sentence because
 * a visitor whose request never left has not been told the code is unknown — the
 * sentence would claim something the server never said.
 */
type VerifyOutcome =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'found'; certificate: PublicCertificate }
  | { kind: 'notFound'; message: string }
  | { kind: 'rateLimited'; message: string }
  | { kind: 'unreachable' };

export function VerifySurface() {
  const [code, setCode] = useState('');
  const [outcome, setOutcome] = useState<VerifyOutcome>({ kind: 'idle' });
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
    setOutcome({ kind: 'busy' });
    const attempt = await verifyCertificateAttempt(code);

    if (attempt.kind === 'unreachable') {
      setOutcome({ kind: 'unreachable' });
      return;
    }

    const { result } = attempt;
    if (result.success && result.certificate) {
      setOutcome({ kind: 'found', certificate: result.certificate });
    } else if (result.rateLimited) {
      setOutcome({
        kind: 'rateLimited',
        message: result.error ?? VERIFY_COPY.rateLimitedBody,
      });
    } else {
      setOutcome({ kind: 'notFound', message: result.error ?? VERIFY_COPY.unexpected });
    }
  }

  function copyCode(val: string) {
    navigator.clipboard.writeText(val);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  }

  const loading = outcome.kind === 'busy';

  return (
    <div
      data-visual="page"
      className="relative overflow-hidden bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary"
    >
      <div className="relative z-10 mx-auto max-w-3xl px-4 pt-4 pb-28 sm:pb-32">
        <div
          data-visual="title"
          className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12"
        >
          <SectionTitle as="h1">
            <SectionTitleHighlight>{VERIFY_COPY.pageTitle}</SectionTitleHighlight>
          </SectionTitle>
        </div>

        <m.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          <VerifySearchCard
            code={code}
            isValidFormat={isValidFormat}
            loading={loading}
            inputRef={inputRef}
            onCodeChange={setCode}
            onSubmit={handleSubmit}
            onSampleClick={() => {
              setCode(VERIFY_COPY.sampleCode);
              inputRef.current?.focus();
            }}
            codeLabel={VERIFY_COPY.codeLabel}
            placeholder={VERIFY_COPY.placeholder}
            submitLabel={VERIFY_COPY.submit}
            sampleLabel={VERIFY_COPY.sampleLabel}
            sampleCode={VERIFY_COPY.sampleCode}
            scanHint={VERIFY_COPY.scanHint}
            invalidFormat={VERIFY_COPY.invalidFormat}
          />

          {/* Loading Indicator State */}
          <AnimatePresence>
            {loading && (
              <VerifyLoadingState title={VERIFY_COPY.busyTitle} body={VERIFY_COPY.busyBody} />
            )}
          </AnimatePresence>

          {/* Error / Rate Limited / Unreachable States */}
          <AnimatePresence>
            {!loading && outcome.kind === 'notFound' && (
              <VerifyErrorState
                title={VERIFY_COPY.notFoundTitle}
                subtitle={VERIFY_COPY.notFoundBody}
                message={outcome.message}
                badge={VERIFY_COPY.notFoundBadge}
                retryLabel={VERIFY_COPY.retry}
                onRetry={() => {
                  setOutcome({ kind: 'idle' });
                  setCode('');
                  inputRef.current?.focus();
                }}
              />
            )}

            {!loading && outcome.kind === 'rateLimited' && (
              <VerifyErrorState
                title={VERIFY_COPY.rateLimitedTitle}
                subtitle={VERIFY_COPY.rateLimitedBody}
                message={outcome.message}
                badge={VERIFY_COPY.rateLimitedBadge}
                retryLabel={VERIFY_COPY.retry}
                onRetry={() => {
                  setOutcome({ kind: 'idle' });
                  setCode('');
                  inputRef.current?.focus();
                }}
              />
            )}

            {!loading && outcome.kind === 'unreachable' && (
              <VerifyErrorState
                title={VERIFY_COPY.unreachableTitle}
                subtitle={VERIFY_COPY.unreachableBody}
                badge={VERIFY_COPY.unreachableBadge}
                retryLabel={VERIFY_COPY.retry}
                onRetry={() => {
                  setOutcome({ kind: 'idle' });
                  inputRef.current?.focus();
                }}
              />
            )}
          </AnimatePresence>

          {/* Success Result State */}
          <AnimatePresence>
            {!loading && outcome.kind === 'found' && (
              <m.div
                key="success"
                variants={resultVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: -20, transition: { duration: 0.15 } }}
                className="my-6"
                aria-label={VERIFY_COPY.foundLabel}
              >
                <CertificateResultCard
                  certificate={outcome.certificate}
                  copied={copied}
                  onCopy={copyCode}
                />
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      </div>

      {/* Moved from the homepage: the sample certificate now sits with the page
          that verifies certificates. */}
      <Certificate />
    </div>
  );
}
