package com.royaraqamia.app.linksnap

import com.royaraqamia.app.store.linksnap.LinksnapLinkRow

/**
 * What one owned-link row is showing (#941).
 *
 * The list has one painted state because the store answers synchronously: there
 * is no loading face to draw, and a skeleton would be a lie about where the rows
 * come from. The row's later faces - selected, editing, deleted - arrive with the
 * bulk bar and the edit dialog (#942, #944).
 */
sealed interface LinksnapRowUiState {
    data class Painted(val row: LinksnapLinkRow) : LinksnapRowUiState
}
