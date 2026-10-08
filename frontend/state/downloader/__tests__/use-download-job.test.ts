import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DownloadJob } from '@/shared/contracts/downloader';
import { useDownloadJob } from '@/frontend/state/downloader/use-download-job';
import { createDownloadJob } from '@/frontend/api/downloader';

vi.mock('@/frontend/api/downloader', () => ({
  createDownloadJob: vi.fn(),
  getDownloadJob: vi.fn(),
}));

const READY_JOB: DownloadJob = {
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
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('useDownloadJob', () => {
  afterEach(() => vi.restoreAllMocks());

  it('auto-saves a ready file once, without a second button', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.mocked(createDownloadJob).mockResolvedValue(READY_JOB);

    const { result } = renderHook(() => useDownloadJob());
    await act(async () => {
      await result.current.start(READY_JOB.sourceUrl, 'video-720p');
    });

    expect(result.current.job?.status).toBe('ready');
    expect(click).toHaveBeenCalledTimes(1);
  });
});
