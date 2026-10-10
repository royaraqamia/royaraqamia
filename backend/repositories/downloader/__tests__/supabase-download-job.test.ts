import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { DOWNLOAD_FORMATS, type DownloadFormat } from '@/shared/contracts/downloader';
import { SupabaseDownloadJobRepository } from '@/backend/repositories/downloader/supabase-download-job';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

/**
 * The format values permitted by the latest `download_jobs_format_check` in the
 * migration history — the widened re-add in
 * `20261010150000_widen_download_jobs_format_check.sql` wins over the narrow
 * inline check in the create migration.
 */
function effectiveFormatCheckValues(): string[] {
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  let values: string[] | null = null;
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8').replace(/\s+/g, ' ');
    const matches = [...sql.matchAll(/check\s*\(\s*format\s+in\s*\(([^)]*)\)/gi)];
    const last = matches.at(-1);
    if (last?.[1]) {
      values = [...last[1].matchAll(/'([^']*)'/g)].map((match) => match[1] as string);
    }
  }
  return values ?? [];
}

function makeClient(format: DownloadFormat) {
  const now = new Date().toISOString();
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'job-1',
      source_url: 'https://example.com/a.mp4',
      format,
      status: 'queued',
      platform: null,
      error: null,
      file_url: null,
      file_filename: null,
      file_size_bytes: null,
      file_expires_at: null,
      created_at: now,
      updated_at: now,
    },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const jobsInsert = vi.fn().mockReturnValue({ select });
  const eventsInsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi
    .fn()
    .mockImplementation((table: string) =>
      table === 'download_jobs' ? { insert: jobsInsert } : { insert: eventsInsert }
    );

  const client = { from } as unknown as SupabaseClient<Database>;
  return { client, jobsInsert, eventsInsert };
}

describe('download_jobs_format_check', () => {
  it('permits exactly the DOWNLOAD_FORMATS vocabulary', () => {
    expect(new Set(effectiveFormatCheckValues())).toEqual(new Set(DOWNLOAD_FORMATS));
  });

  it('rejects any other string', () => {
    expect(effectiveFormatCheckValues()).not.toContain('video-4k');
  });
});

describe('SupabaseDownloadJobRepository.create', () => {
  it.each(DOWNLOAD_FORMATS)('accepts the %s format', async (format) => {
    const { client, jobsInsert } = makeClient(format);
    const repository = new SupabaseDownloadJobRepository(client);

    const job = await repository.create({ url: 'https://example.com/a.mp4', format });

    expect(job.format).toBe(format);
    expect(jobsInsert).toHaveBeenCalledWith({
      source_url: 'https://example.com/a.mp4',
      format,
    });
  });

  it.each([
    'audio-mp3',
    'video-480p',
    'image-original',
    'image-jpg',
    'image-png',
    'image-webp',
  ] as const)('records a Download Job event for %s', async (format) => {
    const { client, eventsInsert } = makeClient(format);
    const repository = new SupabaseDownloadJobRepository(client);

    await repository.create({ url: 'https://example.com/a.mp4', format });

    expect(eventsInsert).toHaveBeenCalledWith({ job_id: 'job-1', status: 'queued' });
  });
});
