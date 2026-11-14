package com.royaraqamia.app.notes

import com.royaraqamia.app.store.notes.NoteRow

/**
 * What the notes list is showing (#1390).
 *
 * Only two states: the store either has live notes to paint or it does not. A
 * load state is deliberately absent — the rows come from the device's database,
 * so the first frame after the shell's is the last pull's answer rather than a
 * spinner that can fail.
 */
sealed interface NotesUiState {
    data object Empty : NotesUiState

    data class Painted(val notes: List<NoteRow>) : NotesUiState

    companion object {
        fun of(notes: List<NoteRow>): NotesUiState =
            if (notes.isEmpty()) Empty else Painted(notes)
    }
}
