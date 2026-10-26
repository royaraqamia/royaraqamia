import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { KeepRange } from '@/frontend/ui/quran/keep-range';
import { SurahAudioDownloadError } from '@/frontend/api/quran/audio';

/**
 * Keeping a range (#559). The quote is the manifest's own byte count per sura,
 * so the size the reader sees is the size the download moves; nothing is fetched
 * until the button is pressed, and a metered connection is refused rather than
 * assumed away.
 *
 * Assertions go through the section's `textContent` because the counts sit in
 * `font-heading` spans (the read-only-number rule), which split the text nodes a
 * by-text query would have to match exactly.
 */
const mocks = vi.hoisted(() => ({
  loadSurahAudio: vi.fn(),
  downloadSurahAudio: vi.fn(),
  audioUsageBytes: vi.fn(),
}));

vi.mock('@/frontend/api/quran/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/quran/audio')>();
  return {
    ...actual,
    loadSurahAudio: mocks.loadSurahAudio,
    downloadSurahAudio: mocks.downloadSurahAudio,
  };
});

vi.mock('@/frontend/shared/local-store/audio', () => ({
  AUDIO_BUDGET_BYTES: 8 * 1024 * 1024,
  audioUsageBytes: mocks.audioUsageBytes,
}));

const MEGABYTE = 1024 * 1024;

const SURAHS = [
  { n: 78, name: 'النبأ' },
  { n: 79, name: 'النازعات' },
  { n: 80, name: 'عبس' },
];

function panel(): HTMLElement {
  return screen.getByRole('region', { name: 'حفظ سُوَر للاستماع دون اتِّصال' });
}

async function chooseThrough(to: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('إلى السُّورة'), { target: { value: to } });
  await waitFor(() => expect(panel()).toHaveTextContent(`${to === '80' ? 3 : 1} سُوَر`));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSurahAudio.mockImplementation(async (surah: number) => ({
    edition: 'ar.alafasy',
    surah,
    name: `سُورة ${surah}`,
    ayahCount: 1,
    bytes: 2 * MEGABYTE,
    files: [{ ayah: 1, key: `k/${surah}.mp3`, bytes: 2 * MEGABYTE, sha256: 'a'.repeat(64) }],
  }));
  mocks.downloadSurahAudio.mockResolvedValue({
    stored: 1,
    reused: 0,
    bytes: 2 * MEGABYTE,
    evicted: 0,
  });
  mocks.audioUsageBytes.mockResolvedValue(0);
});

describe('KeepRange', () => {
  it('quotes the range from the manifests before anything is downloaded', async () => {
    render(<KeepRange surahs={SURAHS} />);
    await chooseThrough('80');

    expect(panel()).toHaveTextContent('3 سُوَر');
    expect(panel()).toHaveTextContent('≈ 6.0 م.ب');
    expect(mocks.downloadSurahAudio).not.toHaveBeenCalled();
  });

  it('keeps every sura in the range, in order, without spending on a metered connection', async () => {
    render(<KeepRange surahs={SURAHS} />);
    await chooseThrough('80');

    fireEvent.click(screen.getByRole('button', { name: /احفظ المحدَّد/ }));

    await waitFor(() => expect(panel()).toHaveTextContent('حُفظت 3 من السُّوَر'));
    expect(mocks.downloadSurahAudio.mock.calls.map(([surah]) => surah)).toEqual([78, 79, 80]);
    for (const [, options] of mocks.downloadSurahAudio.mock.calls) {
      expect(options).toMatchObject({ allowMetered: false });
    }
  });

  it('asks before spending on a metered connection, and proceeds only on the second press', async () => {
    mocks.downloadSurahAudio.mockRejectedValueOnce(
      new SurahAudioDownloadError('metered', 'this connection is metered')
    );

    render(<KeepRange surahs={SURAHS} />);
    await chooseThrough('78');

    fireEvent.click(screen.getByRole('button', { name: /احفظ المحدَّد/ }));

    await waitFor(() => expect(panel()).toHaveTextContent('أنت على اتِّصال مدفوع'));

    fireEvent.click(screen.getByRole('button', { name: /احفظ على أي حال/ }));

    await waitFor(() => expect(mocks.downloadSurahAudio).toHaveBeenCalledTimes(2));
    expect(mocks.downloadSurahAudio.mock.calls[1]?.[1]).toMatchObject({ allowMetered: true });
  });

  it('names the sura a download stopped at', async () => {
    mocks.downloadSurahAudio
      .mockResolvedValueOnce({ stored: 1, reused: 0, bytes: MEGABYTE, evicted: 0 })
      .mockRejectedValueOnce(new Error('audio responded 503'));

    render(<KeepRange surahs={SURAHS} />);
    await chooseThrough('80');

    fireEvent.click(screen.getByRole('button', { name: /احفظ المحدَّد/ }));

    await waitFor(() => expect(panel()).toHaveTextContent('لم يكتمل الحفظ عند سُورة النازعات'));
  });

  it('warns that the range will evict older suras when it does not fit', async () => {
    mocks.audioUsageBytes.mockResolvedValue(7 * MEGABYTE);

    render(<KeepRange surahs={SURAHS} />);
    await chooseThrough('80');

    expect(panel()).toHaveTextContent('ستُزال السُّوَر الأقدم');
  });
});

afterEach(cleanup);
