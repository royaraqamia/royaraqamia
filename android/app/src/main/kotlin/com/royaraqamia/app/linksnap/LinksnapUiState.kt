package com.royaraqamia.app.linksnap

import com.royaraqamia.app.store.linksnap.LinksnapLinkRow

/**
 * What the LinkSnap dashboard is showing (#654).
 *
 * One painted state, because the store answers synchronously: there is no
 * loading face to draw, and a skeleton would be a lie about where the rows come
 * from. An empty list is still [Painted] -- the page's heading and the
 * shortener are what a member sees, with the empty state below them.
 */
sealed interface LinksnapUiState {
    data class Painted(val rows: List<LinksnapLinkRow>) : LinksnapUiState

    companion object {
        fun of(rows: List<LinksnapLinkRow>): LinksnapUiState = Painted(rows)
    }
}
