package com.royaraqamia.app.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsClicksByDateItem

/**
 * What the owned link's analytics chart is showing (#963).
 *
 * The page's `analytics-chart.tsx` has two faces: the plot when the period has
 * days in it, and the dashed sentence when the range is empty. The pair list
 * names both so the app cannot quietly drop the face the page draws.
 */
sealed interface LinksnapAnalyticsChartUiState {
    data class Ready(
        val stats: List<LinksnapAnalyticsResponseAnalyticsClicksByDateItem>,
    ) : LinksnapAnalyticsChartUiState

    data object Empty : LinksnapAnalyticsChartUiState
}
