package com.royaraqamia.app.quran

/**
 * The index's states (#955).
 *
 * The text is vendored, so the list has one state once it is read; the search
 * field's own loading and failure faces belong to the field, not to the screen.
 * It is declared rather than left implicit because `docs/mobile/parity.json`
 * lists the states a port draws, and `check:parity` fails a state that exists on
 * one side only.
 */
sealed interface QuranIndexState {
    /** The list, with the reader's last place above it when there is one. */
    data object AtRest : QuranIndexState
}
