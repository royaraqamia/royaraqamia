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

  it('maps a rejected link (4xx) to an unsupported error without retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 422 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      backoffMs: 1,
      fetchImpl,
    });

    await expect(provider.dispatch(INPUT)).rejects.toThrow('غير مدعوم');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient fault (5xx) then succeeds', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      backoffMs: 1,
      fetchImpl,
    });

    await provider.dispatch(INPUT);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured attempts and reports unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      attempts: 2,
      backoffMs: 1,
      fetchImpl,
    });

    await expect(provider.dispatch(INPUT)).rejects.toBeInstanceOf(MediaProviderError);
    await expect(provider.dispatch(INPUT)).rejects.toThrow('غير متاحة');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('maps an unreachable host to an unavailable error after retrying', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockRejectedValue(new Error('ECONNREFUSED'));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      attempts: 2,
      backoffMs: 1,
      fetchImpl,
    });

    await expect(provider.dispatch(INPUT)).rejects.toBeInstanceOf(MediaProviderError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries when the host does not acknowledge in time, then succeeds', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          })
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/job',
      timeoutMs: 5,
      backoffMs: 1,
      fetchImpl,
    });

    await provider.dispatch(INPUT);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('CobaltMediaProvider.inspect', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('probes the derived /probe endpoint and shapes a successful result', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(
      jsonResponse({
        status: 'ok',
        platform: 'soundcloud.com',
        title: 'A track',
        durationSeconds: 12,
        thumbnailUrl: 'https://img.example/a.jpg',
        mediaType: 'audio',
        formats: [
          { format: 'audio', filesizeBytes: 5_000_000 },
          { format: 'not-a-format', filesizeBytes: 1 },
          { format: 'video-720p', filesizeBytes: 'nope' },
        ],
      })
    );
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/dispatch',
      token: 't',
      fetchImpl,
    });

    const result = await provider.inspect({ url: 'https://soundcloud.com/x/y' });

    expect(fetchImpl.mock.calls[0]![0]).toBe('https://host.example/probe');
    expect(result).toEqual({
      status: 'ok',
      platform: 'soundcloud.com',
      platformName: null,
      mediaType: 'audio',
      title: 'A track',
      durationSeconds: 12,
      thumbnailUrl: 'https://img.example/a.jpg',
      formats: [{ format: 'audio', filesizeBytes: 5_000_000 }],
    });
  });

  it('maps a shaped failure status to its visitor message', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(jsonResponse({ status: 'blocked' }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/dispatch',
      fetchImpl,
    });

    const result = await provider.inspect({ url: 'https://youtube.com/watch?v=x' });

    expect(result.status).toBe('blocked');
    expect(result).toHaveProperty('message');
  });

  it('throws a MediaProviderError when the host is unreachable or errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(new Response(null, { status: 503 }));
    const provider = new CobaltMediaProvider({
      url: 'https://host.example/dispatch',
      fetchImpl,
    });

    await expect(provider.inspect({ url: 'https://x.example/a' })).rejects.toBeInstanceOf(
      MediaProviderError
    );
  });

  it('treats an unexpected media type as unknown', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(jsonResponse({ status: 'ok', mediaType: 'hologram', formats: [] }));
    const provider = new CobaltMediaProvider({ url: 'https://host.example/dispatch', fetchImpl });

    const result = await provider.inspect({ url: 'https://x.example/a' });
    expect(result.status).toBe('unknown');
  });
});
