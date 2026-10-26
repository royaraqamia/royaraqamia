'use client';

import type { ReactNode } from 'react';
import { useQuranPlayer } from '@/frontend/state/quran/player-context';
import { ReadingSession } from './reading-session';
import { PlayerFloat } from './player-float';

interface QuranReadingClientProps {
  surah: number;
  bismillah: string | null;
  audio: { ayahCount: number } | null;
  children: ReactNode;
}

/**
 * The reader's client half: which Ayah is playing, and the recitation float.
 *
 * Both are views of the document's player now (ADR-0085), not owner state, so
 * navigation cannot take the sound with it and the mini player elsewhere in the
 * app shows the same Ayah.
 */
export function QuranReadingClient({ surah, bismillah, audio, children }: QuranReadingClientProps) {
  const { state } = useQuranPlayer();
  const isThisSurah = state.surah === surah;
  const playingAyah =
    isThisSurah && (state.status === 'playing' || state.status === 'paused') ? state.ayah : null;

  return (
    <>
      {audio ? <PlayerFloat surah={surah} ayahCount={audio.ayahCount} /> : null}

      {bismillah ? (
        <p className="font-quran mt-8 text-center text-2xl leading-[2.4] text-foreground sm:text-3xl">
          {bismillah}
        </p>
      ) : null}

      <ReadingSession surah={surah} playingAyah={playingAyah} className="mt-10 flex flex-col gap-4">
        {children}
      </ReadingSession>
    </>
  );
}
