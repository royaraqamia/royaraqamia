'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  DOWNLOAD_FORMATS,
  DOWNLOAD_FORMAT_LABELS,
  DOWNLOAD_STATUS_LABELS,
  MEDIA_KIND_LABELS,
  type DownloadFormat,
} from '@/shared/contracts/downloader';
import { TURNSTILE_SITE_KEY } from '@/frontend/shared/constants';
import { formatBytes } from '@/frontend/shared/format-bytes';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Turnstile } from '@/frontend/ui/shared/turnstile';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { useDownloadJob } from '@/frontend/state/downloader/use-download-job';
import { useInspectDownloadLink } from '@/frontend/state/downloader/use-inspect-link';

const REQUIRES_TURNSTILE = TURNSTILE_SITE_KEY.length > 0;

export function DownloaderPage() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<DownloadFormat>('video-720p');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const { job, loading, error, start, reset } = useDownloadJob();
  const { result: probe, loading: probing } = useInspectDownloadLink(url);

  const inspectedFormats =
    probe?.status === 'ok' && probe.formats.length > 0 ? probe.formats : null;
  const formatOptions = useMemo<DownloadFormat[]>(
    () =>
      inspectedFormats ? inspectedFormats.map((option) => option.format) : [...DOWNLOAD_FORMATS],
    [inspectedFormats]
  );

  /** A link the provider refuses outright (not merely unprobeable right now). */
  const probeRefusal = probe && probe.status !== 'ok' && probe.status !== 'unknown' ? probe : null;

  // Keep the selected format within what the link actually offers.
  useEffect(() => {
    const first = formatOptions[0];
    if (first && !formatOptions.includes(format)) {
      setFormat(first);
    }
  }, [formatOptions, format]);

  function sizeFor(option: DownloadFormat): string | null {
    const match = inspectedFormats?.find((entry) => entry.format === option);
    return formatBytes(match?.filesizeBytes ?? null);
  }

  const submitted = job !== null;
  const blockedByTurnstile = REQUIRES_TURNSTILE && !turnstileToken;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await start(url.trim(), format, turnstileToken ?? undefined);
    setTurnstileToken(null);
    setTurnstileKey((key) => key + 1);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col items-center text-center">
        <SectionTitle as="h1">
          مُنزِّل <SectionTitleHighlight>الوسائط</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <Card>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="downloader-url" className="text-sm font-medium text-foreground">
                الرَّابط
              </label>
              <Input
                id="downloader-url"
                name="url"
                type="url"
                dir="ltr"
                inputMode="url"
                autoComplete="url"
                placeholder="https://..."
                value={url}
                error={Boolean(error) && !submitted}
                onChange={(event) => setUrl(event.target.value)}
                required
              />
            </div>

            {probing && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                جاري فحص الرَّابط…
              </p>
            )}

            {probe?.status === 'ok' && (
              <p className="text-xs font-medium text-foreground" aria-live="polite">
                {probe.platformName ?? probe.platform ?? 'رابط مدعوم'}
                {' · '}
                {MEDIA_KIND_LABELS[probe.mediaType]}
              </p>
            )}

            {probeRefusal && (
              <p className="text-sm text-destructive" role="alert">
                {probeRefusal.message}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="downloader-format" className="text-sm font-medium text-foreground">
                الصِّيغة
              </label>
              <Select value={format} onValueChange={(value) => setFormat(value as DownloadFormat)}>
                <SelectTrigger id="downloader-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((option) => {
                    const size = sizeFor(option);
                    return (
                      <SelectItem key={option} value={option}>
                        {DOWNLOAD_FORMAT_LABELS[option]}
                        {size ? ` · ${size}` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {REQUIRES_TURNSTILE && <Turnstile key={turnstileKey} onToken={setTurnstileToken} />}

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                type="submit"
                variant="hero"
                isLoading={loading}
                disabled={url.trim().length === 0 || blockedByTurnstile || probeRefusal !== null}
              >
                ابدأ التَّنزيل
              </Button>
              {submitted && (
                <Button type="button" variant="ghost" onClick={reset} disabled={loading}>
                  طلب جديد
                </Button>
              )}
            </div>
          </form>

          {error && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}

          {job && (
            <div
              className="mt-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-foreground">
                الحالة: {DOWNLOAD_STATUS_LABELS[job.status]}
              </p>

              {job.status === 'failed' && job.error && (
                <p className="text-sm text-destructive">{job.error}</p>
              )}

              {job.status === 'ready' && job.file && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-muted-foreground">
                    اكتمل التَّنزيل وبدأ حفظ الملف تلقائيًّا في جهازك.
                  </p>
                  {/* Recovery path: some mobile browsers ignore a programmatic save. */}
                  <a
                    href={job.file.url}
                    download={job.file.filename}
                    className="text-sm font-bold text-primary hover:underline underline-offset-4"
                  >
                    لم يبدأ التَّنزيل؟ اضغط للحفظ
                  </a>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
