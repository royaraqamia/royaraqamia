package com.royaraqamia.app.blogpress

import com.royaraqamia.app.store.blogpress.BlogpressPostRow

/**
 * What the BlogPress posts list is showing (#952).
 *
 * One painted state plus the empty one, because the store answers synchronously:
 * there is no loading face to draw, and a skeleton would be a lie about where the
 * rows come from. An empty list is its own state so the page's empty sentence is
 * a state of the pair rather than a branch nobody checks.
 */
sealed interface BlogpressUiState {
    data class Painted(val posts: List<BlogpressPostRow>) : BlogpressUiState

    data object Empty : BlogpressUiState

    companion object {
        fun of(posts: List<BlogpressPostRow>): BlogpressUiState =
            if (posts.isEmpty()) Empty else Painted(posts)
    }
}
