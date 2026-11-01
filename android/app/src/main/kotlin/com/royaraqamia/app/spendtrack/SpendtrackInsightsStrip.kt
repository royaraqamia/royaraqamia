package com.royaraqamia.app.spendtrack

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
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.util.Locale

/**
 * The three insights the dashboard opens with (#653), the app's half of
 * `frontend/ui/spendtrack/insights-strip.tsx`.
 *
 * The site's cards in the site's words: the daily average, the category that
 * took the largest share and how large, and how this window compares with the
 * one before it. The numbers are [SpendtrackStats]'s, which is a port of the
 * site's own arithmetic, and every one of them is drawn in the digit face with
 * ASCII digits — the share and the delta are formatted with `Locale.ROOT`, so an
 * Arabic-locale phone cannot answer in Arabic-Indic numerals (ADR-0054).
 */
@Composable
fun SpendtrackInsightsStrip(
    insights: SpendtrackStats.SpendInsights,
    currency: String?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val rising = (insights.deltaPct ?: 0.0) > 0

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        InsightCard(
            label = SpendtrackInsightsCopy.AVG_LABEL,
            icon = LucideVectors.Calendar,
            iconTint = RoyColors.primary,
        ) {
            Text(
                text = SpendtrackMoney.label(insights.averagePerDay, currency),
                style = type.digits(type.body.copy(fontWeight = FontWeight.Bold)),
                color = RoyColors.foreground,
            )
        }

        InsightCard(
            label = SpendtrackInsightsCopy.TOP_LABEL,
            icon = LucideVectors.Trophy,
            iconTint = RoyColors.primary,
        ) {
            val top = insights.topCategory
            if (top == null) {
                Text(
                    text = SpendtrackInsightsCopy.NO_DATA,
                    style = type.small,
                    color = Recipes.Row.labelColor,
                )
            } else {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier =
                            Modifier.size(10.dp)
                                .clip(CircleShape)
                                .background(colorOf(top.colorHex))
                    )
                    Text(
                        modifier = Modifier.weight(1f),
                        text = top.name,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = share(insights.topCategoryShare),
                        style = type.digits(type.xs),
                        color = Recipes.Row.labelColor,
                    )
                }
            }
        }

        InsightCard(
            label = SpendtrackInsightsCopy.COMPARISON_LABEL,
            icon = if (rising) LucideVectors.TrendingUp else LucideVectors.TrendingDown,
            iconTint = if (rising) RoyColors.destructive else RoyColors.success,
        ) {
            val delta = insights.deltaPct
            if (delta == null) {
                Text(
                    text = "—",
                    style = type.digits(type.body.copy(fontWeight = FontWeight.Bold)),
                    color = Recipes.Row.labelColor,
                )
            } else {
                Text(
                    text = (if (rising) "▲ " else "▼ ") + percent(delta),
                    style = type.digits(type.body.copy(fontWeight = FontWeight.Bold)),
                    color = if (rising) RoyColors.destructive else RoyColors.success,
                )
            }
        }
    }
}

/** One of the three: a label at the start, the site's glyph at the end, the figure below. */
@Composable
private fun InsightCard(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconTint: Color,
    value: @Composable () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(text = label, style = type.xs, color = Recipes.Row.labelColor)
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
            value()
        }
    }
}

/** `12.5٪` — the site's Arabic percent sign, with ASCII digits. */
internal fun share(value: Double): String = percent(value)

private fun percent(value: Double): String =
    BigDecimalFormat.oneDecimal(value) + SpendtrackInsightsCopy.PERCENT

/** One decimal place, in ASCII, whatever the device's locale is. */
internal object BigDecimalFormat {
    fun oneDecimal(value: Double): String =
        String.format(Locale.ROOT, "%.1f", Math.abs(value) * 100)
}
