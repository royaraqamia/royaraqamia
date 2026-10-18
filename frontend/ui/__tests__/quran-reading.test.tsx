import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { ReadingPanel } from '@/frontend/ui/quran/reading-panel';
import { SurahReader } from '@/frontend/ui/quran/surah-reader';
import { GUEST_IDENTITY } from '@/frontend/shared/local-store/identity';
import type { SurahSummary, Surah } from '@/shared/contracts/quran';

/**
 * A reader's own state, end to end: the server-rendered sura, the Local Store
 * behind it, and the two surfaces that read it.
 *
 * The suite's IntersectionObserver is a stub that never calls back, so scroll
 * tracking is driven by hand here — which is also the only way to assert *when*
 * a position is written rather than just that it eventually is.
 */
class ControllableObserver {
  static instances: ControllableObserver[] = [];
  readonly targets: Element[] = [];

  constructor(readonly callback: IntersectionObserverCallback) {
    ControllableObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }

  /** Puts an element on the reading line, as the browser would. */
  enter(target: Element) {
    this.callback(
      [{ target, isIntersecting: true } as unknown as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
}

const summary: SurahSummary = {
  n: 2,
  name: 'سورة الاختبار',
  ayahCount: 2,
  revelation: 'Medinan',
  revelationOrder: 87,
};

const surah: Surah = {
  n: 2,
  name: 'سورة الاختبار',
  bismillah: null,
  ayahs: ['آية أولى', 'آية ثانية'],
};

const names = Array.from({ length: 114 }, (_, index) => `السُّورة ${index + 1}`);

let opened: QuranLocalStore[] = [];

/** A handle on the same store the components open. */
async function readerStore(): Promise<QuranLocalStore> {
  const store = await QuranLocalStore.open(GUEST_IDENTITY, globalThis.indexedDB);
  opened.push(store);
  return store;
}

/**
 * The observer watching the ayat.
 *
 * Not simply the first one: `next/link` creates an IntersectionObserver of its
 * own for viewport prefetch, so the instances here are a mixed bag and the one
 * under test has to be picked by what it observes.
 */
function ayahObserver(): ControllableObserver | undefined {
  return ControllableObserver.instances.find((observer) =>
    observer.targets.some((target) => target.getAttribute('data-ayah') !== null)
  );
}

/**
 * Waits for the reader's store to be open, which a reader can see for themselves
 * as a mark becoming pressable, and returns the observer tracking their place.
 */
async function whenReady(control: HTMLElement): Promise<ControllableObserver> {
  await waitFor(() => expect(control).not.toBeDisabled());

  const observer = ayahObserver();
  expect(observer).toBeDefined();
  // The whole sura is tracked, not just its first ayah.
  expect(observer!.targets).toHaveLength(surah.ayahs.length);
  return observer!;
}

function renderSurah() {
  return render(<SurahReader surah={surah} summary={summary} previous={null} next={null} />);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  ControllableObserver.instances = [];
  globalThis.IntersectionObserver = ControllableObserver as unknown as typeof IntersectionObserver;
  opened = [];
});

afterEach(() => {
  cleanup();
  for (const store of opened) store.close();
});

describe('marking an ayah', () => {
  it('stays unpressable until the store behind it is open', () => {
    // The number is a control the moment it renders, but a press before the
    // store is open could not be saved — and a control that silently does
    // nothing is worse than one that says it cannot.
    renderSurah();
    expect(screen.getByRole('button', { name: 'علامة على الآية ١' })).toBeDisabled();
  });

  it('marks an ayah when its number is pressed, and stores it', async () => {
    renderSurah();
    const button = screen.getByRole('button', { name: 'علامة على الآية ٢' });

    await whenReady(button);
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));

    expect(await (await readerStore()).listBookmarks()).toEqual([
      expect.objectContaining({ surah: 2, ayah: 2 }),
    ]);
  });

  it('takes the mark off when the same number is pressed again', async () => {
    renderSurah();
    const button = screen.getByRole('button', { name: 'علامة على الآية ١' });

    await whenReady(button);
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'false'));

    expect(await (await readerStore()).listBookmarks()).toEqual([]);
  });

  it('leaves the sura readable when the browser has no IndexedDB', async () => {
    // Private modes and hardened browsers hide it; reading must not depend on it.
    globalThis.indexedDB = undefined as unknown as IDBFactory;

    renderSurah();
    const button = screen.getByRole('button', { name: 'علامة على الآية ١' });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(/آية أولى/)).toBeInTheDocument();
  });
});

describe('remembering where the reader stopped', () => {
  it('writes the ayah on the reading line, once the reader settles on it', async () => {
    renderSurah();
    const observer = await whenReady(screen.getByRole('button', { name: 'علامة على الآية ١' }));
    const ayah = document.getElementById('ayah-2')!;

    await act(async () => {
      observer.enter(ayah);
    });

    // The write is debounced, so it lands a moment after the reader stops moving.
    await waitFor(
      async () => {
        expect(await (await readerStore()).getReadingPosition()).toMatchObject({
          surah: 2,
          ayah: 2,
        });
      },
      { timeout: 5_000 }
    );
  });
});

describe('the index panel', () => {
  it('offers the reader their place and their marks', async () => {
    const store = await readerStore();
    await store.saveReadingPosition(2, 2);
    await store.toggleBookmark(2, 2);

    render(<ReadingPanel names={names} />);

    const resume = await screen.findByRole('link', { name: /أكمل القراءة/ });
    expect(resume).toHaveAttribute('href', '/quran/2#ayah-2');
    expect(resume).toHaveTextContent('السُّورة 2 · الآية ٢');
    expect(screen.getByRole('region', { name: 'علاماتي' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'السُّورة 2 · ٢' })).toHaveAttribute(
      'href',
      '/quran/2#ayah-2'
    );
  });

  it('takes a mark off the list, and keeps the place', async () => {
    const store = await readerStore();
    await store.saveReadingPosition(2, 1);
    await store.toggleBookmark(2, 2);

    render(<ReadingPanel names={names} />);
    const remove = await screen.findByRole('button', { name: /إزالة علامة/ });

    fireEvent.click(remove);

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'علاماتي' })).not.toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: /أكمل القراءة/ })).toBeInTheDocument();
    expect(await (await readerStore()).listBookmarks()).toEqual([]);
  });
});
