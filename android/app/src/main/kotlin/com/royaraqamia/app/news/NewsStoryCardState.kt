package com.royaraqamia.app.news

/**
 * One story card's faces (#926).
 *
 * The card is a read-only row: a headline, its summary and the link back to the
 * source. It has no expanded form and no write, so the only face it draws is
 * the one at rest.
 */
sealed interface NewsStoryCardState {
    data object AtRest : NewsStoryCardState
}
