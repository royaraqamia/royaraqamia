'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { useAdminDownloaderSettings } from '@/frontend/state/downloader/use-admin-downloader';

const MB = 1024 * 1024;

const FIELDS = [
  { id: 'duration', label: 'أقصى مدة (دقائق)', min: 1, step: 1 },
  { id: 'audio', label: 'أقصى حجم للصوت (ميغابايت)', min: 1, step: 1 },
  { id: 'video', label: 'أقصى حجم للفيديو (ميغابايت)', min: 1, step: 1 },
  { id: 'concurrency', label: 'أقصى عدد طلبات متزامنة', min: 1, step: 1 },
  { id: 'ttl', label: 'صلاحية رابط الملف (ثوانٍ)', min: 30, step: 1 },
];

export function DownloaderSettingsView() {
  const { settings, loading, error, saving, save } = useAdminDownloaderSettings();
  const [duration, setDuration] = useState('');
  const [audio, setAudio] = useState('');
  const [video, setVideo] = useState('');
  const [concurrency, setConcurrency] = useState('');
  const [ttl, setTtl] = useState('');

  useEffect(() => {
    if (!settings) return;
    setDuration(String(Math.round(settings.maxDurationSeconds / 60)));
    setAudio(String(Math.round(settings.maxAudioBytes / MB)));
    setVideo(String(Math.round(settings.maxVideoBytes / MB)));
    setConcurrency(String(settings.maxConcurrentJobs));
    setTtl(String(settings.linkTtlSeconds));
  }, [settings]);

  const values: Record<string, [string, (value: string) => void]> = {
    duration: [duration, setDuration],
    audio: [audio, setAudio],
    video: [video, setVideo],
    concurrency: [concurrency, setConcurrency],
    ttl: [ttl, setTtl],
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save({
      maxDurationSeconds: Math.round(Number(duration) * 60),
      maxAudioBytes: Math.round(Number(audio) * MB),
      maxVideoBytes: Math.round(Number(video) * MB),
      maxConcurrentJobs: Math.round(Number(concurrency)),
      linkTtlSeconds: Math.round(Number(ttl)),
    });
  }

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="جاري تحميل الإعدادات">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <form
      className="border-border/60 bg-card max-w-xl space-y-4 rounded-2xl border p-5"
      onSubmit={handleSubmit}
    >
      <p className="text-sm text-muted-foreground">
        تُطبَّق هذه الحدود فور الحفظ على كل طلب تنزيل جديد دون حاجة إلى إعادة نشر.
      </p>

      {FIELDS.map((field) => {
        const [value, setValue] = values[field.id]!;
        return (
          <div key={field.id} className="flex flex-col gap-1.5">
            <label htmlFor={`setting-${field.id}`} className="text-sm font-medium text-foreground">
              {field.label}
            </label>
            <Input
              id={`setting-${field.id}`}
              type="number"
              inputMode="numeric"
              min={field.min}
              step={field.step}
              dir="ltr"
              value={value}
              disabled={saving}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        );
      })}

      <Button type="submit" isLoading={saving}>
        <Save className="size-4" aria-hidden="true" />
        حفظ الإعدادات
      </Button>
    </form>
  );
}
