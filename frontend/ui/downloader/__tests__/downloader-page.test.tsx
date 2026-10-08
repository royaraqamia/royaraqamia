import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DownloadJob } from '@/shared/contracts/downloader';

const READY_JOB: DownloadJob = vi.hoisted(() => ({
  id: '11111111-1111-4111-8111-111111111111',
  sourceUrl: 'https://platform.example/watch?v=1',
  format: 'video-720p',
  status: 'ready',
  platform: 'platform.example',
  error: null,
  file: {
    url: 'https://host.example/media/11111111-1111-4111-8111-111111111111?sig=x',
    filename: 'clip.mp4',
    sizeBytes: 123,
    expiresAt: '2099-01-01T00:00:00.000Z',
  },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

vi.mock('@/frontend/state/downloader/use-download-job', () => ({
  useDownloadJob: () => ({
    job: READY_JOB,
    loading: false,
    error: null,
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

import { DownloaderPage } from '@/frontend/ui/downloader/downloader-page';

describe('DownloaderPage', () => {
  it('offers a recovery link for a ready file and no separate save button', () => {
    render(<DownloaderPage />);

    const recovery = screen.getByRole('link', { name: 'لم يبدأ التنزيل؟ اضغط للحفظ' });
    expect(recovery).toHaveAttribute('download', READY_JOB.file!.filename);
    expect(screen.queryByText('حفظ الملف')).not.toBeInTheDocument();
  });
});
