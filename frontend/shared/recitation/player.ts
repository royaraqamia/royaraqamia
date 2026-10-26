import { recitationEngine, resetRecitationEngine } from './engine';
import { createNativeRecitationPlayer } from './native-player';
import type { RecitationPlayer } from './state';

/**
 * The document's one player, whichever engine this platform has.
 *
 * The shell's plugin wins when it is present. A missing bridge — the upstream
 * Capacitor case ADR-0043 measured — falls back to the browser engine rather
 * than leaving a dead control; playback then has the web engine's limits, which
 * is still better than nothing on a build whose bridge did not inject.
 */
let shared: RecitationPlayer | null = null;

export function recitationPlayer(): RecitationPlayer {
  shared ??= createNativeRecitationPlayer() ?? recitationEngine();
  return shared;
}

/** Drops the shared player, for tests and a hot reload that outlived it. */
export function resetRecitationPlayer(): void {
  const current = shared;
  shared = null;
  current?.dispose();
  resetRecitationEngine();
}
