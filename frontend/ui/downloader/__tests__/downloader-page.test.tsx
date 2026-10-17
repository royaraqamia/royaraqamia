import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadJob } from '@/shared/contracts/downloader';

/** The job the mocked hook hands the page; each test sets the file link it renders. */
const state = vi.hoisted(() => ({ job: null as DownloadJob | null }));

vi.mock('@/frontend/state/downloader/use-download-job', () => ({
  useDownloadJob: () => ({
    job: state.job,
    loading: false,
    error: null,
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { DownloaderPage } from '@/frontend/ui/downloader/downloader-page';

function readyJob(url: string): DownloadJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    sourceUrl: 'https://platform.example/watch?v=1',
    format: 'video-720p',
    status: 'ready',
    platform: 'platform.example',
    error: null,
    file: { url, filename: 'clip.mp4', sizeBytes: 123, expiresAt: '2099-01-01T00:00:00.000Z' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const SAFE_URL = 'https://host.example/media/11111111-1111-4111-8111-111111111111?sig=x';

describe('DownloaderPage', () => {
  beforeEach(() => {
    state.job = readyJob(SAFE_URL);
  });

  it('offers a recovery link for a ready file and no separate save button', () => {
    render(<DownloaderPage />);

    const recovery = screen.getByRole('link', { name: 'لم يبدأ التَّنزيل؟ اضغط للحفظ' });
    expect(recovery).toHaveAttribute('href', SAFE_URL);
    expect(recovery).toHaveAttribute('download', 'clip.mp4');
    expect(screen.queryByText('حفظ الملف')).not.toBeInTheDocument();
  });

  /**
   * `href` is a sink for `javascript:`; the provider's link is untrusted, so an
   * unsafe one is never rendered as a link.
   */
  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://host.example/x.mp4'])(
    'renders no recovery link for the unsafe file link %s',
    (url) => {
      state.job = readyJob(url);

      render(<DownloaderPage />);

      expect(
        screen.queryByRole('link', { name: 'لم يبدأ التَّنزيل؟ اضغط للحفظ' })
      ).not.toBeInTheDocument();
      expect(screen.getByText('الحالة: جاهز للتنزيل')).toBeInTheDocument();
    }
  );
});
