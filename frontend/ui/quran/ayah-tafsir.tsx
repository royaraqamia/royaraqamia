'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { QuranSurahTafsir, SurahTafsirRef } from '@/shared/contracts/quran-tafsir';

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
 * Without JavaScript the button is not rendered at all: the reader gets the text
 * it has always had, rather than a control that cannot answer.
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
  const [openAyah, setOpenAyah] = useState<number | null>(null);
  const [bodies, setBodies] = useState<Record<number, string | null> | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // One request per sura, however many times the reader toggles.
  const inFlight = useRef<Promise<void> | null>(null);

  const load = useCallback(() => {
    if (inFlight.current || !tafsir) return inFlight.current ?? Promise.resolve();

    setLoading(true);
    setFailed(false);

    const request = fetch(`${tafsir.path}?v=${tafsir.version}`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`tafsir responded ${response.status}`);
        const file = (await response.json()) as QuranSurahTafsir;
        const next: Record<number, string | null> = {};
        for (const entry of file.ayat) next[entry.ayah] = entry.text;
        setBodies(next);
      })
      .catch(() => {
        // A failed fetch must not be remembered, or a retry can never succeed.
        inFlight.current = null;
        setFailed(true);
      })
      .finally(() => {
        setLoading(false);
      });

    inFlight.current = request;
    return request;
  }, [tafsir]);

  const toggle = useCallback(
    (ayah: number) => {
      setOpenAyah((current) => (current === ayah ? null : ayah));
      if (bodies === null) void load();
    },
    [bodies, load]
  );

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
 * One Ayah's tafsir control. Renders the button, and the body it opens.
 *
 * Outside a provider — a detached render, a preview — it draws nothing: there is
 * no sura file to offer, so there is nothing truthful to press.
 */
export function AyahTafsir({ ayah }: { ayah: number }) {
  const context = useContext(TafsirContext);
  // The control is drawn only once this component is live. A client component is
  // still rendered on the server, and a button that cannot answer is worse than no
  // button: without JavaScript the reader keeps the text it has always had.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  if (!context || !live) return null;

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
        التفسير
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label={`تفسير الآية ${ayah}`}
          className="ayah-tafsir-panel"
        >
          {loading ? (
            <p className="ayah-tafsir-note" aria-live="polite">
              جاري تحميل التفسير…
            </p>
          ) : failed ? (
            <p className="ayah-tafsir-note">
              تعذّر تحميل التفسير.{' '}
              <button type="button" onClick={retry} className="ayah-tafsir-retry">
                إعادة المحاولة
              </button>
            </p>
          ) : body ? (
            <>
              <p className="ayah-tafsir-text">{body}</p>
              <p className="ayah-tafsir-credit">
                {tafsir.attribution}
                {' · '}
                <a href={tafsir.source} target="_blank" rel="noreferrer">
                  مركز تفسير للدراسات القرآنية
                </a>
                {' · '}
                <a href={tafsir.licenceUrl} target="_blank" rel="noreferrer">
                  {tafsir.licence}
                </a>
              </p>
            </>
          ) : (
            <p className="ayah-tafsir-note">لا تفسير لهذه الآية في هذه الطبعة.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
