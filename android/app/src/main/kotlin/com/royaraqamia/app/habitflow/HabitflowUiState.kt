package com.royaraqamia.app.habitflow

import com.royaraqamia.app.store.habitflow.HabitRow

/**
 * What the HabitFlow list is showing (#649).
 *
 * Two states, because the store answers synchronously: there is no loading face
 * to draw, and a skeleton would be a lie about where the rows come from. [Empty]
 * is the site's own empty state, with the site's own words.
 */
sealed interface HabitflowUiState {
    data class Painted(val rows: List<HabitRow>) : HabitflowUiState

    data object Empty : HabitflowUiState

    companion object {
        fun of(rows: List<HabitRow>): HabitflowUiState =
            if (rows.isEmpty()) Empty else Painted(rows)
    }
}
