package com.royaraqamia.app.news

/**
 * The day strip's faces (#926).
 *
 * It is a filter over a board that has already been read, so its only state is
 * the one it draws: the list of retained days, with the selected chip marked.
 * A failed read is the screen's state, not the strip's, and the strip is simply
 * disabled while a saved digest is on screen.
 */
sealed interface NewsArchiveState {
    data object AtRest : NewsArchiveState
}
