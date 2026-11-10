package com.royaraqamia.app.spendtrack

/**
 * The test tags the visual gate reads (#958, ADR-0118).
 *
 * The page's `data-visual` anchors and these tags are one list: `check:visual`
 * measures the same named boxes on both clients, so a renamed tag is a contract
 * change rather than a rename. The objects live beside the components so the
 * screen and the gate's test draw with the same names.
 */
object SpendtrackMetrics {
    const val TOTAL_CARD = "spendtrack-total"
    const val BUDGET_CARD = "spendtrack-budget"
    const val FILTER_BAR = "spendtrack-filter"
    const val EXPENSE_ROW = "spendtrack-row"
    const val CATEGORY_CHART = "spendtrack-category-chart"
    const val DAILY_CHART = "spendtrack-daily-chart"
}
