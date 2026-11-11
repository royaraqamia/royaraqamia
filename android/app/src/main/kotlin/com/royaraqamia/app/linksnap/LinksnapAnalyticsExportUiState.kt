package com.royaraqamia.app.linksnap

/**
 * What the analytics drawer's CSV action is doing (#964).
 *
 * The page's action has the same three faces: the button at rest, the spinner
 * while the export route answers, and the failure sentence when the read does
 * not. They are states of one control rather than three screens, and the pair
 * list names every one so the app cannot quietly drop a face the page draws.
 */
sealed interface LinksnapAnalyticsExportUiState {
    data object Idle : LinksnapAnalyticsExportUiState

    data object Busy : LinksnapAnalyticsExportUiState

    data object Failed : LinksnapAnalyticsExportUiState
}
