package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors

/**
 * How the window's spending splits across categories (#653), the app's half of
 * `frontend/ui/spendtrack/category-pie-chart.tsx`.
 *
 * A ring rather than the site's interactive pie: the slices are drawn from
 * [SpendtrackStats.categoryBreakdown], and the legend names each one with its
 * share — the same information the site's chart carries, at the size a phone can
 * read. Tapping a slice to filter is the filter bar's job, not the chart's.
 *
 * The share is formatted by [BigDecimalFormat], so it reads `42.0` on every
 * device rather than in the phone's own numerals (ADR-0054).
 */
@Composable
fun SpendtrackCategoryChart(
    state: SpendtrackCategoryChartUiState,
    currency: String?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

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
                text = SpendtrackCategoryChartCopy.TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            Text(
                text = SpendtrackCategoryChartCopy.HINT,
                style = type.xs,
                color = Recipes.Row.labelColor,
            )

            when (state) {
                is SpendtrackCategoryChartUiState.Empty -> {
                    Text(
                        text = SpendtrackCategoryChartCopy.NO_DATA_TITLE,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                    )
                    Text(
                        text = SpendtrackCategoryChartCopy.NO_DATA_BODY,
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                    )
                }
                is SpendtrackCategoryChartUiState.Painted -> {
                    val total = state.slices.sumOf { it.total }
                    Donut(slices = state.slices, total = total)
                    Text(
                        text =
                            SpendtrackCategoryChartCopy.TOTAL_LABEL +
                                ": " +
                                SpendtrackMoney.label(total, currency),
                        style = type.digits(type.small.copy(fontWeight = FontWeight.Bold)),
                        color = RoyColors.foreground,
                    )
                    for (slice in state.slices) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier =
                                    Modifier.size(10.dp)
                                        .clip(CircleShape)
                                        .background(colorOf(slice.colorHex))
                            )
                            Text(
                                modifier = Modifier.weight(1f),
                                text = slice.name,
                                style = type.small,
                                color = RoyColors.foreground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = SpendtrackMoney.label(slice.total, currency),
                                style = type.digits(type.xs),
                                color = Recipes.Row.labelColor,
                            )
                            Text(
                                text =
                                    SpendtrackCategoryChartCopy.SHARE_OF_TOTAL.replace(
                                        "{percentage}",
                                        BigDecimalFormat.oneDecimal(
                                            if (total > 0) slice.total / total else 0.0
                                        ),
                                    ),
                                style = type.digits(type.xs),
                                color = Recipes.Row.labelColor,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The ring itself: one arc per slice, proportional to its share of the window. */
@Composable
private fun Donut(slices: List<CategoryTotal>, total: Double) {
    val type = LocalRoyTypeScale.current

    Box(contentAlignment = Alignment.Center) {
        Canvas(modifier = Modifier.size(140.dp)) {
            val stroke = 18.dp.toPx()
            val size = Size(this.size.width - stroke, this.size.height - stroke)
            val topLeft = androidx.compose.ui.geometry.Offset(stroke / 2, stroke / 2)

            if (total <= 0) return@Canvas
            var startAngle = -90f
            for (slice in slices) {
                val sweep = (slice.total / total * 360.0).toFloat()
                drawArc(
                    color = colorOf(slice.colorHex),
                    startAngle = startAngle,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = size,
                    style = Stroke(width = stroke),
                )
                startAngle += sweep
            }
        }
        Text(
            text = SpendtrackCategoryChartCopy.AMOUNT_LABEL,
            style = type.xs,
            color = Recipes.Row.labelColor,
        )
    }
}
