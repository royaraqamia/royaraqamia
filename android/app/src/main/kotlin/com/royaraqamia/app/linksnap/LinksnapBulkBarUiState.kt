package com.royaraqamia.app.linksnap

/**
 * What the owned list's bulk bar is showing (#942).
 *
 * The bar has one drawn face: it exists only while the account owns a row, and
 * the row count and the selection are its data rather than separate faces. The
 * `Visible` state is declared so `check:parity` can hold the bar to the page's
 * copy source, and so a later disabled or offline face is a state the pair
 * notices instead of a branch the app keeps to itself.
 */
sealed interface LinksnapBulkBarUiState {
    data object Visible : LinksnapBulkBarUiState
}
