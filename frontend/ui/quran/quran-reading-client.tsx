'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { ReadingSession } from './reading-session';
import { SurahAudioPlayer } from './audio-player';

interface QuranReadingClientProps {
  surah: number;
  bismillah: string | null;
  audio: { ayahCount: number } | null;
  children: ReactNode;
}

export function QuranReadingClient({ surah, bismillah, audio, children }: QuranReadingClientProps) {
  const [playingAyah, setPlayingAyah] = useState<number | null>(null);
  const onAyahChange = useCallback((ayah: number | null) => setPlayingAyah(ayah), []);

  return (
    <>
      {audio ? (
        <SurahAudioPlayer surah={surah} ayahCount={audio.ayahCount} onAyahChange={onAyahChange} />
      ) : null}

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
