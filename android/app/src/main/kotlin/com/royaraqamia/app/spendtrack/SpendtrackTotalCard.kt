package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * SpendTrack's total (#653), the app's half of
 * `frontend/ui/spendtrack/total-spend-card.tsx`.
 *
 * The figure is the one the site draws: the month's sum, formatted by
 * [SpendtrackMoney] with ASCII digits and `en-US` grouping, in the read-only
 * digit face — so a phone set to an Arabic locale cannot answer in Arabic-Indic
 * numerals where the site writes `1,250.00` (ADR-0054).
 *
 * There is one state ([SpendtrackTotalUiState.Ready]) because a total is always
 * drawable: zero is a figure, not an absence the card should hide.
 */
@Composable
fun SpendtrackTotalCard(
    total: Double,
    currency: String?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val label = SpendtrackTotalCopy.TOTAL_LABEL.replace("{amount}", SpendtrackMoney.label(total, currency))

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(Recipes.Card.gap(spacing)),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = SpendtrackTotalCopy.TOTAL_TITLE,
                    style = type.small,
                    color = Recipes.Row.labelColor,
                )
                Icon(
                    imageVector = LucideVectors.DollarSign,
                    // The figure beside it is the card's content; a description
                    // here would read the same number twice.
                    contentDescription = null,
                    tint = RoyColors.primary,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
            Text(
                text = SpendtrackMoney.label(total, currency),
                style = type.digits(type.body.copy(fontWeight = FontWeight.Bold)),
                color = RoyColors.foreground,
            )
            Text(
                text = label,
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }
    }
}
