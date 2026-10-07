'use client';

import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import {
  DOWNLOAD_FORMATS,
  DOWNLOAD_FORMAT_LABELS,
  DOWNLOAD_STATUS_LABELS,
  type DownloadFormat,
} from '@/shared/contracts/downloader';
import { TURNSTILE_SITE_KEY } from '@/frontend/shared/constants';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/frontend/ui/primitives/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/ui/primitives/select';
import { Turnstile } from '@/frontend/ui/shared/turnstile';
import { useDownloadJob } from '@/frontend/state/downloader/use-download-job';

const REQUIRES_TURNSTILE = TURNSTILE_SITE_KEY.length > 0;

const ACCEPTABLE_USE_POINTS = [
  'روابط عامة فقط — لا محتوى محميًّا بـ DRM أو مدفوعًا أو خاصًّا.',
  'أنت مسؤول عن امتلاك حقّ تنزيل هذا المحتوى.',
  'تنزيل واحد لكل طلب، بحدّ أقصى 15 دقيقة وحجم محدود.',
];

export function DownloaderPage() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<DownloadFormat>('video-720p');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const { job, loading, error, start, reset } = useDownloadJob();

  const submitted = job !== null;
  const blockedByTurnstile = REQUIRES_TURNSTILE && !turnstileToken;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await start(url.trim(), format, turnstileToken ?? undefined);
    setTurnstileToken(null);
    setTurnstileKey((key) => key + 1);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          مُنزِّل الوسائط
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          حمّل الصوت أو الفيديو من رابط على منصّات التواصل الاجتماعي.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>رابط الوسائط</CardTitle>
          <CardDescription>ألصق رابطًا عامًّا، اختر الصيغة، ثم ابدأ التنزيل.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="downloader-url" className="text-sm font-medium text-foreground">
                الرابط
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="downloader-format" className="text-sm font-medium text-foreground">
                الصيغة
              </label>
              <Select value={format} onValueChange={(value) => setFormat(value as DownloadFormat)}>
                <SelectTrigger id="downloader-format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOWNLOAD_FORMATS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {DOWNLOAD_FORMAT_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {REQUIRES_TURNSTILE && <Turnstile key={turnstileKey} onToken={setTurnstileToken} />}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                isLoading={loading}
                disabled={url.trim().length === 0 || blockedByTurnstile}
              >
                ابدأ التنزيل
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
                <Button asChild variant="default">
                  <a href={job.file.url} download={job.file.filename}>
                    <Download aria-hidden="true" />
                    حفظ الملف
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <section
        aria-labelledby="downloader-aup"
        className="rounded-xl border border-border/60 bg-card/60 p-5"
      >
        <h2 id="downloader-aup" className="mb-2 text-sm font-bold text-foreground">
          الاستخدام المقبول
        </h2>
        <ul className="list-disc space-y-1 ps-5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {ACCEPTABLE_USE_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground sm:text-sm">
          لطلبات إزالة المحتوى، يُرجَى التّواصل عبر{' '}
          <a
            href="mailto:contact@royaraqamia.com"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            contact@royaraqamia.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}
