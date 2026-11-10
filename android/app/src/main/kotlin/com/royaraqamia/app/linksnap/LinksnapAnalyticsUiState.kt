package com.royaraqamia.app.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalytics

/**
 * What the owned link's analytics drawer is showing (#962).
 *
 * The page's drawer has the same four faces: the skeleton while the read runs,
 * the sentence a device with the radio off gets instead of zeroes, the refusal
 * when the server answers, and the blocks the summary fills. They are states of
 * one drawer rather than four screens, and the pair list names every one so the
 * app cannot quietly drop a face the page draws.
 */
sealed interface LinksnapAnalyticsUiState {
    data object Loading : LinksnapAnalyticsUiState

    data object Offline : LinksnapAnalyticsUiState

    data class Failed(val message: String) : LinksnapAnalyticsUiState

    data class Ready(val summary: LinksnapAnalyticsResponseAnalytics) : LinksnapAnalyticsUiState
}
