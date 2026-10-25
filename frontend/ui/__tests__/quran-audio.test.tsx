import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import type { Surah, SurahSummary } from '@/shared/contracts/quran';

const recording = vi.hoisted(() => ({
  saved: 'none' as 'none' | 'partial' | 'complete',
  download: vi.fn(),
  playlist: {
    edition: 'ar.alafasy',
    surah: 1,
    name: 'سورة الاختبار',
    ayahCount: 2,
    bytes: 80,
    files: [
      { ayah: 1, key: 'ar.alafasy/001/001.mp3', bytes: 40, sha256: 'a'.repeat(64) },
      { ayah: 2, key: 'ar.alafasy/001/002.mp3', bytes: 40, sha256: 'b'.repeat(64) },
    ],
  },
  edition: {
    id: 'ar.alafasy',
    reciter: 'مشاري راشد العفاسي',
    reciterLatin: 'Mishary Rashid Alafasy',
    style: 'Murattal',
    bitrateKbps: 64,
    container: 'mp3',
    baseUrl: 'https://audio.royaraqamia.com',
    sourceUrl: 'https://cdn.islamic.network/quran/audio/64/ar.alafasy/{ayah}.mp3',
    attribution: 'مشاري راشد العفاسي',
    license: 'test',
    suras: 114,
    ayat: 6236,
    bytes: 1,
    complete: true,
  },
}));

vi.mock('@/frontend/api/quran/audio', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/api/quran/audio')>();
  return {
    ...actual,
    loadSurahAudio: vi.fn(async () => recording.playlist),
    loadAudioEdition: vi.fn(async () => recording.edition),
    loadPlayableSurah: vi.fn(async () => ({
      manifest: recording.playlist,
      baseUrl: recording.edition.baseUrl,
    })),
    readDownloadedSurah: vi.fn(async () => recording.saved),
    downloadSurahAudio: recording.download,
  };
});

const summary: SurahSummary = {
  n: 1,
  name: 'سورة الاختبار',
  ayahCount: 2,
  revelation: 'Meccan',
  revelationOrder: 5,
};

const surah: Surah = {
  n: 1,
  name: 'سورة الاختبار',
  bismillah: null,
  ayahs: ['آية أولى', 'آية ثانية'],
};

function renderPlaying() {
  render(<SurahReader surah={surah} summary={summary} audio={{ ayahCount: 2, bytes: 80 }} />);
  fireEvent.click(screen.getByRole('button', { name: 'استمع للسُّورة' }));
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  recording.saved = 'none';
  recording.download.mockResolvedValue({ stored: 2, reused: 0, bytes: 80, evicted: 0 });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('the Ayah being played', () => {
  it('is marked, moves with the queue, and clears when the recitation stops', async () => {
    renderPlaying();

    const first = document.getElementById('ayah-1')!;
    const second = document.getElementById('ayah-2')!;

    await waitFor(() => expect(first).toHaveAttribute('aria-current', 'true'), { timeout: 5_000 });
    expect(first).toHaveClass('quran-ayah-playing');
    expect(second).not.toHaveAttribute('aria-current');
    expect(second).not.toHaveClass('quran-ayah-playing');

    fireEvent(document.querySelector('audio')!, new Event('ended'));

    await waitFor(() => expect(second).toHaveAttribute('aria-current', 'true'));
    expect(second).toHaveClass('quran-ayah-playing');
    expect(first).not.toHaveAttribute('aria-current');
    expect(first).not.toHaveClass('quran-ayah-playing');

    fireEvent.click(screen.getByRole('button', { name: 'إيقاف التِّلاوة' }));

    await waitFor(() => expect(first).not.toHaveAttribute('aria-current'));
    expect(second).not.toHaveAttribute('aria-current');
    expect(second).not.toHaveClass('quran-ayah-playing');
  });
});

describe('the offline copy', () => {
  it('offers the download with the size it costs, then shows the surah as kept', async () => {
    render(<SurahReader surah={surah} summary={summary} audio={{ ayahCount: 2, bytes: 80 }} />);

    const download = await screen.findByRole('button', { name: /حفظ التِّلاوة/ });
    expect(download).toHaveTextContent('ك.ب');

    fireEvent.click(download);

    await waitFor(() => expect(screen.getByText(/محفوظة على هذا الجُهاز/)).toBeInTheDocument());
    expect(recording.download).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ allowMetered: false })
    );
  });

  it('shows a kept surah as kept before anything is pressed', async () => {
    recording.saved = 'complete';

    render(<SurahReader surah={surah} summary={summary} audio={{ ayahCount: 2, bytes: 80 }} />);

    expect(await screen.findByText(/محفوظة على هذا الجُهاز/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /حفظ التِّلاوة/ })).not.toBeInTheDocument();
  });

  it('names the state when an unkept surah cannot reach the host', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('no source'));
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });

    render(<SurahReader surah={surah} summary={summary} audio={{ ayahCount: 2, bytes: 80 }} />);
    fireEvent.click(screen.getByRole('button', { name: 'استمع للسُّورة' }));

    expect(
      await screen.findByText(
        /هذه السُّورة غير محفوظة على هذا الجُهاز، وتحتاج اتِّصالًا لتشغيلها\./
      )
    ).toBeInTheDocument();

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });
});
