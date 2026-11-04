package com.royaraqamia.app.quran

/**
 * One sura's states (#955).
 *
 * The text is vendored, so a sura that exists has one state; a missing sura is
 * the shell's 404, not a face of this screen. Declared for `check:parity`, which
 * fails a state that exists on one side only.
 */
sealed interface QuranSurahState {
    /** The header, the boundaries and the Ayat, at the reader's last place. */
    data object AtRest : QuranSurahState
}
