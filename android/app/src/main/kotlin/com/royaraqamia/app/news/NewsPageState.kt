package com.royaraqamia.app.news

/**
 * The page's heading (#926).
 *
 * It has one face: the title above the board, drawn before the first read
 * answers and unchanged by any filter or failure.
 */
sealed interface NewsPageState {
    data object AtRest : NewsPageState
}
