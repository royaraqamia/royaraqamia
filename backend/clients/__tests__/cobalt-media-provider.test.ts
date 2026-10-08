import { describe, expect, it, vi } from 'vitest';
import { CobaltMediaProvider } from '@/backend/clients/cobalt-media-provider';
import {
  MediaProviderError,
  type MediaDispatchInput,
} from '@/backend/services/downloader/media-provider';

const INPUT: MediaDispatchInput = {
  jobId: '11111111-1111-4111-8111-111111111111',
  url: 'https://platform.example/watch?v=1',
  format: 'video-720p',
  callbackUrl: 'https://royaraqamia.com/api/downloader/callback',
  maxDurationSeconds: 900,
  maxSizeBytes: 200 * 1024 * 1024,
  linkTtlSeconds: 300,
};

describe('CobaltMediaProvider.dispatch', () => {
  it('POSTs the job, token and callback target to the provider host', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 202 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      token: 'provider-token',
      fetchImpl,
    });

    await provider.dispatch(INPUT);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://host.example/job');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer provider-token');
    expect(JSON.parse(init?.body as string)).toEqual({
      jobId: INPUT.jobId,
      url: INPUT.url,
      format: INPUT.format,
      callbackUrl: INPUT.callbackUrl,
      maxDurationSeconds: INPUT.maxDurationSeconds,
      maxSizeBytes: INPUT.maxSizeBytes,
      linkTtlSeconds: INPUT.linkTtlSeconds,
    });
  });

  it('omits the Authorization header when no token is configured', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 202 }));
    const provider = new CobaltMediaProvider({ url: 'https://host.example/job', fetchImpl });

    await provider.dispatch(INPUT);

    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).authorization).toBe(
      undefined
    );
  });

  it('maps a rejected link (4xx) to an unsupported error', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 422 }));
    const provider = new CobaltMediaProvider({ url: 'https://host.example/job', fetchImpl });

    await expect(provider.dispatch(INPUT)).rejects.toBeInstanceOf(MediaProviderError);
    await expect(provider.dispatch(INPUT)).rejects.toThrow('غير مدعوم');
  });

  it('maps a provider fault (5xx) to an unavailable error', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new CobaltMediaProvider({ url: 'https://host.example/job', fetchImpl });

    await expect(provider.dispatch(INPUT)).rejects.toThrow('غير متاحة');
  });

  it('maps an unreachable host to an unavailable error', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new CobaltMediaProvider({ url: 'https://host.example/job', fetchImpl });

    await expect(provider.dispatch(INPUT)).rejects.toBeInstanceOf(MediaProviderError);
  });

  it('reports unavailable when the host does not acknowledge in time', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      timeoutMs: 5,
      fetchImpl,
    });

    await expect(provider.dispatch(INPUT)).rejects.toThrow('غير متاحة');
  });
});
