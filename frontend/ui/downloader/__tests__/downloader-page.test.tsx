import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadJob, ProbeResult } from '@/shared/contracts/downloader';

/** The job the mocked hook hands the page; each test sets the file link it renders. */
const state = vi.hoisted(() => ({ job: null as DownloadJob | null }));

/** The connectivity the page reads; the downloader is an ADR-0031 surface. */
const { pwa } = vi.hoisted(() => ({ pwa: { isOnline: true } }));

/** The link inspection's verdict, so a failure can be driven without a server. */
const { probeState } = vi.hoisted(() => ({
  probeState: { result: null as ProbeResult | null, loading: false },
}));

vi.mock('@/frontend/state/downloader/use-download-job', () => ({
  useDownloadJob: () => ({
    job: state.job,
    loading: false,
    error: null,
    start: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@/frontend/state/downloader/use-inspect-link', () => ({
  useInspectDownloadLink: () => probeState,
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({ ...pwa }),
}));

import { DownloaderPage } from '@/frontend/ui/downloader/downloader-page';

const UNPROBEABLE = {
  status: 'unknown',
  message: 'تعذّر فحص الرَّابط. تأكّد من صحّته وحاول مجددًا.',
} as const;

const A_LINK = 'https://platform.example/watch?v=1';

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
    pwa.isOnline = true;
    probeState.result = null;
    probeState.loading = false;
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

  /**
   * The page used to keep the inspection's "could not check the link" message to
   * itself: the state existed, the message existed, and nothing rendered it.
   */
  it('renders the inspection message when the link could not be inspected', () => {
    probeState.result = UNPROBEABLE;

    render(<DownloaderPage />);

    expect(screen.getByText(UNPROBEABLE.message)).toBeInTheDocument();
  });

  /**
   * ADR-0031: the downloader is online-only, so it names the connection instead
   * of leaving a button that presses into a failure. The message the inspection
   * writes blames the link — with the radio off, the link is not the answer.
   */
  it('names the connection instead of blaming the link while offline', () => {
    pwa.isOnline = false;
    probeState.result = UNPROBEABLE;

    render(<DownloaderPage />);

    expect(screen.getByText(/يتطلَّب التَّنزيل اتصالًا/)).toBeInTheDocument();
    expect(screen.queryByText(UNPROBEABLE.message)).not.toBeInTheDocument();
  });

  it('refuses to start a download while offline', () => {
    pwa.isOnline = false;

    render(<DownloaderPage />);
    fireEvent.change(screen.getByLabelText('الرَّابط'), { target: { value: A_LINK } });

    expect(screen.getByRole('button', { name: 'ابدأ التَّنزيل' })).toBeDisabled();
  });

  it('still lets an unprobeable link be tried while online', () => {
    probeState.result = UNPROBEABLE;

    render(<DownloaderPage />);
    fireEvent.change(screen.getByLabelText('الرَّابط'), { target: { value: A_LINK } });

    // A provider that could not be asked is not a provider that refused.
    expect(screen.getByRole('button', { name: 'ابدأ التَّنزيل' })).not.toBeDisabled();
  });
});
