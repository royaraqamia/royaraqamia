package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.shared.CurrencySymbols
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors

/**
 * The window's spending day by day (#653), the app's half of
 * `frontend/ui/spendtrack/daily-bar-chart.tsx`.
 *
 * Bars rather than the site's interactive chart: one bar per day that has an
 * expense, scaled to the window's largest day, with the first and last day named
 * under the axis and the amount axis named in the currency. The numbers behind
 * it are [SpendtrackStats.dailyTotals] — the site's own arithmetic — so the two
 * clients cannot grow different opinions about what a day cost.
 */
@Composable
fun SpendtrackDailyChart(
    state: SpendtrackDailyChartUiState,
    currency: String?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val symbol = currency?.let { CurrencySymbols.byCode[it]?.symbol }.orEmpty()

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Text(
                text =
                    SpendtrackDailyChartCopy.AMOUNT_AXIS.replace("{symbol}", symbol),
                style = type.xs,
                color = Recipes.Row.labelColor,
            )

            when (state) {
                is SpendtrackDailyChartUiState.Empty -> {
                    Text(
                        text = SpendtrackDailyChartCopy.NO_DATA_TITLE,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                    )
                    Text(
                        text = SpendtrackDailyChartCopy.NO_DATA_BODY,
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                    )
                }
                is SpendtrackDailyChartUiState.Painted -> {
                    Bars(bars = state.bars)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = SpendtrackDailyChartCopy.DATE_AXIS,
                            style = type.xs,
                            color = Recipes.Row.labelColor,
                        )
                        Text(
                            text = state.bars.last().date,
                            style = type.digits(type.xs),
                            color = Recipes.Row.labelColor,
                        )
                    }
                }
            }
        }
    }
}

/** One bar per day, the tallest day filling the height. */
@Composable
private fun Bars(bars: List<DailyTotal>) {
    val tallest = bars.maxOfOrNull { it.total } ?: 0.0

    Canvas(modifier = Modifier.fillMaxWidth().height(120.dp)) {
        if (tallest <= 0) return@Canvas
        val gap = 4.dp.toPx()
        val width = ((size.width - gap * (bars.size - 1)) / bars.size).coerceAtLeast(2f)

        bars.forEachIndexed { index, bar ->
            val height = (bar.total / tallest * size.height).toFloat().coerceAtLeast(2f)
            drawRect(
                color = RoyColors.primary,
                topLeft = Offset(x = index * (width + gap), y = size.height - height),
                size = Size(width, height),
            )
        }
    }
}
