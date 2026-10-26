'use client';

import { usePathname } from 'next/navigation';

import { useQuranPlayer } from '@/frontend/state/quran/player-context';
import { PlayerBar } from './player-bar';
import { readerSurahFromPath } from './route';

/**
 * The mini player's one rule: it is shown when a recitation exists and this page
 * is not the sura it is playing. On that sura's reader the float already owns
 * the controls (ADR-0083), and two sets of them on one screen would be one too
 * many.
 */
export function GlobalPlayer() {
  const pathname = usePathname();
  const { state } = useQuranPlayer();

  if (state.surah === null) return null;
  if (readerSurahFromPath(pathname) === state.surah) return null;

  return <PlayerBar />;
}
