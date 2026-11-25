'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { QuranSurahTafsir, SurahTafsirRef } from '@/shared/contracts/quran-tafsir';
import { replaceSearch } from '@/frontend/shared/replace-search';
import { useScreenScope } from '@/frontend/state/use-screen-scope';
import { quranTafsirScope } from './quran-screen-scope';
import { INITIAL_TAFSIR_STATE, tafsirReducer } from './ayah-tafsir.reducer';
import { QURAN_AYAH_TAFSIR_COPY } from './ayah-tafsir-copy';

/**
 * The Tafsir, read beside an Ayah (ADR-0057, P3).
 *
 * Two components, one owner per sura: the provider holds what is open and the
 * sura's file once it has arrived, and each Ayah's slot holds a button. The Ayat
 * themselves stay the server's children — nothing here re-renders the text.
 *
 * The file is fetched the first time a reader opens a tafsir on this sura, not
 * with the page: a sura of 286 Ayat would otherwise carry its study apparatus
 * into a read that never asked for it. The URL is `immutable` under a
 * `?v=<hash8>` (the vendor script's own sha256), so a re-vendor is a new key in
 * every cache rather than a stale body.
 *
 * The open panel is `?tafsir=N` (ADR-0147): it is a view that deserves a link —
 * a shared Ayah opens with its study beside it — while the fetch and its error
 * state stay where the file lives. The hash (`#ayah-N`) is kept when the query
 * changes, so linking an Ayah and opening its tafsir are one address.
 *
 * That address is also what the server draws. Before hydration the control is an
 * `<a href="?tafsir=N#ayah-N">`; once the provider is live it becomes the button
 * that toggles in place. Both wear the same class and box, so the upgrade moves
 * nothing (#1738) — and a reader without JavaScript gets a link to a real view
 * rather than a button that cannot answer.
 */

interface TafsirContextValue {
  tafsir: SurahTafsirRef;
  openAyah: number | null;
  loading: boolean;
  failed: boolean;
  bodies: Readonly<Record<number, string | null>> | null;
  toggle: (ayah: number) => void;
  retry: () => void;
}

const TafsirContext = createContext<TafsirContextValue | null>(null);

export function QuranTafsirProvider({
  tafsir,
  children,
}: {
  /** Null when this sura has no vendored tafsir: the reader renders as it always has. */
  tafsir: SurahTafsirRef | null;
  children: ReactNode;
}) {
  const [{ openAyah, bodies, loading, failed }, dispatch] = useReducer(
    tafsirReducer,
    INITIAL_TAFSIR_STATE
  );
  // One request per sura, however many times the reader toggles.
  const inFlight = useRef<Promise<void> | null>(null);

  // The panel is an overlay above the reader, so its Ayah wins the focus while
  // it is open (ADR-0181, #1420).
  useScreenScope(quranTafsirScope(openAyah));

  const load = useCallback(() => {
    if (inFlight.current || !tafsir) return inFlight.current ?? Promise.resolve();

    dispatch({ type: 'loadStarted' });

    const request = fetch(`${tafsir.path}?v=${tafsir.version}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`tafsir responded ${response.status}`);
        const file = (await response.json()) as QuranSurahTafsir;
        const next: Record<number, string | null> = {};
        for (const entry of file.ayat) next[entry.ayah] = entry.text;
        dispatch({ type: 'loadSucceeded', bodies: next });
      })
      .catch(() => {
        // A failed fetch must not be remembered, or a retry can never succeed.
        inFlight.current = null;
        dispatch({ type: 'loadFailed' });
      });

    inFlight.current = request;
    return request;
  }, [tafsir]);

  const toggle = useCallback(
    (ayah: number) => {
      const next = openAyah === ayah ? null : ayah;
      dispatch({ type: 'opened', ayah: next });
      if (next !== null && bodies === null) void load();

      const params = new URLSearchParams(window.location.search);
      if (next === null) params.delete('tafsir');
      else params.set('tafsir', String(next));
      replaceSearch(params.toString());
    },
    [openAyah, bodies, load]
  );

  // A shared or refreshed link opens the study panel it names. Read from the
  // address bar rather than `useSearchParams`, so the sura page stays a static
  // document for every reader (ADR-0031, ADR-0147).
  useEffect(() => {
    if (!tafsir) return;

    const value = new URLSearchParams(window.location.search).get('tafsir');
    if (value === null) return;

    const ayah = Number(value);
    if (!Number.isInteger(ayah) || ayah < 1) return;

    dispatch({ type: 'opened', ayah });
    void load();
  }, [tafsir, load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  const value = useMemo<TafsirContextValue | null>(
    () => (tafsir ? { tafsir, openAyah, loading, failed, bodies, toggle, retry } : null),
    [tafsir, openAyah, loading, failed, bodies, toggle, retry]
  );

  if (!value) return <>{children}</>;

  return <TafsirContext.Provider value={value}>{children}</TafsirContext.Provider>;
}

/**
 * One Ayah's tafsir control. The server draws a link to the panel's address; the
 * live component replaces it with the button that opens it, and with the body it
 * opens.
 *
 * Outside a provider — a detached render, a preview — it draws nothing: there is
 * no sura file to offer, so there is nothing truthful to press.
 */
export function AyahTafsir({ ayah }: { ayah: number }) {
  const context = useContext(TafsirContext);
  // A client component is also rendered on the server. Both renders start with
  // the link, so hydration matches; the effect then upgrades it in place.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  if (!context) return null;

  if (!live) {
    return (
      <div className="ayah-tafsir" data-tafsir-ayah={ayah}>
        <a href={`?tafsir=${ayah}#ayah-${ayah}`} className="ayah-tafsir-toggle">
          {QURAN_AYAH_TAFSIR_COPY.toggle}
        </a>
      </div>
    );
  }

  const { tafsir, openAyah, loading, failed, bodies, toggle, retry } = context;
  const open = openAyah === ayah;
  const body = bodies?.[ayah] ?? null;
  const panelId = `ayah-tafsir-${ayah}`;

  return (
    <div className="ayah-tafsir" data-tafsir-ayah={ayah}>
      <button
        type="button"
        onClick={() => toggle(ayah)}
        aria-expanded={open}
        aria-controls={panelId}
        className="ayah-tafsir-toggle"
      >
        {QURAN_AYAH_TAFSIR_COPY.toggle}
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={QURAN_AYAH_TAFSIR_COPY.panelLabel.replace('{ayah}', String(ayah))}
          className="ayah-tafsir-panel"
        >
          {loading ? (
            <p className="ayah-tafsir-note" aria-live="polite">
              {QURAN_AYAH_TAFSIR_COPY.loading}
            </p>
          ) : failed ? (
            <p className="ayah-tafsir-note">
              {QURAN_AYAH_TAFSIR_COPY.failed}{' '}
              <button type="button" onClick={retry} className="ayah-tafsir-retry">
                {QURAN_AYAH_TAFSIR_COPY.retry}
              </button>
            </p>
          ) : body ? (
            <>
              <p className="ayah-tafsir-text">{body}</p>
              <p className="ayah-tafsir-credit">
                {tafsir.attribution}
                {' · '}
                <a href={tafsir.source} target="_blank" rel="noreferrer">
                  {QURAN_AYAH_TAFSIR_COPY.credit}
                </a>
                {' · '}
                <a href={tafsir.licenceUrl} target="_blank" rel="noreferrer">
                  {tafsir.licence}
                </a>
              </p>
            </>
          ) : (
            <p className="ayah-tafsir-note">{QURAN_AYAH_TAFSIR_COPY.missing}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
