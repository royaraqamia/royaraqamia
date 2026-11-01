package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.shared.CurrencySymbols
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * SpendTrack's budget card (#653), the app's half of
 * `frontend/ui/spendtrack/budget-card.tsx`.
 *
 * The site's card in the site's words: the month's budget, the percentage it is
 * spent to, what is left, the sentence for a month that has gone over, and the
 * form that sets it. The number is drawn in the digit face with ASCII digits and
 * `en-US` grouping ([SpendtrackMoney]), and the percentage is formatted with
 * `Locale.ROOT` so an Arabic-locale phone cannot answer in Arabic-Indic numerals
 * where the site writes `72%` (ADR-0054).
 *
 * The write is the same one the site queues: `budget.set` on the `(month,
 * category)` pair, in the store first and on the server when the queue drains.
 */
@Composable
fun SpendtrackBudgetCard(
    state: SpendtrackBudgetUiState,
    spent: Double,
    currency: String?,
    month: String,
    onSave: (amount: Double) -> Boolean,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    var input by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val budget = (state as? SpendtrackBudgetUiState.Set)?.budget
    val symbol = currency?.let { CurrencySymbols.byCode[it]?.symbol }.orEmpty()

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
                Column {
                    Text(
                        text = SpendtrackBudgetCopy.TITLE,
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = Recipes.Row.labelColor,
                    )
                    Text(text = month, style = type.xs, color = Recipes.Row.labelColor)
                }
                Icon(
                    imageVector = LucideVectors.Wallet,
                    contentDescription = null,
                    tint = RoyColors.primary,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Bottom,
            ) {
                Column {
                    Text(
                        text = SpendtrackBudgetCopy.CURRENT,
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                    )
                    Text(
                        text =
                            if (budget == null) SpendtrackBudgetCopy.UNSET
                            else SpendtrackMoney.label(budget, currency),
                        style = type.digits(type.body.copy(fontWeight = FontWeight.Bold)),
                        color = RoyColors.foreground,
                    )
                }
                if (budget != null) {
                    BudgetPercent(spent = spent, budget = budget)
                }
            }

            if (budget != null) {
                val used = if (budget > 0) (spent / budget).coerceIn(0.0, 1.0) else 0.0
                Box(
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(8.dp)
                            .clip(RoundedCornerShape(percent = 50))
                            .background(RoyColors.muted)
                ) {
                    Box(
                        modifier =
                            Modifier.fillMaxWidth(used.toFloat())
                                .height(8.dp)
                                .clip(RoundedCornerShape(percent = 50))
                                .background(if (spent > budget) RoyColors.destructive else RoyColors.primary)
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text =
                            SpendtrackBudgetCopy.SPENT.replace(
                                "{amount}",
                                SpendtrackMoney.label(spent, currency),
                            ),
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                    )
                    Text(
                        text =
                            SpendtrackBudgetCopy.REMAINING.replace(
                                "{amount}",
                                SpendtrackMoney.label((budget - spent).coerceAtLeast(0.0), currency),
                            ),
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                    )
                }
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector =
                            if (spent > budget) LucideVectors.TriangleAlert else LucideVectors.CircleCheck,
                        contentDescription = null,
                        tint = if (spent > budget) RoyColors.destructive else RoyColors.success,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text =
                            if (spent > budget) SpendtrackBudgetCopy.EXCEEDED
                            else SpendtrackBudgetCopy.MONTH_SPENT.replace(
                                "{amount}",
                                SpendtrackMoney.label(spent, currency),
                            ),
                        style = type.xs,
                        color = if (spent > budget) RoyColors.destructive else Recipes.Row.labelColor,
                    )
                }
            }

            OutlinedTextField(
                value = input,
                onValueChange = {
                    input = it
                    error = null
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                label = {
                    Text(SpendtrackBudgetCopy.SET_LABEL.replace("{symbol}", symbol))
                },
                placeholder = { Text("0.00") },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Button(
                    onClick = {
                        val amount = parseAmount(input)
                        if (amount == null) {
                            error = SpendtrackBudgetCopy.INVALID_AMOUNT
                            return@Button
                        }
                        busy = true
                        val saved = onSave(amount)
                        busy = false
                        if (saved) {
                            input = ""
                            error = null
                        } else {
                            error = SpendtrackBudgetCopy.SAVE_ERROR
                        }
                    },
                ) {
                    if (busy) {
                        Icon(
                            imageVector = LucideVectors.LoaderCircle,
                            contentDescription = SpendtrackBudgetCopy.SAVE,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                    } else {
                        Text(SpendtrackBudgetCopy.SAVE)
                    }
                }
            }

            error?.let {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.TriangleAlert,
                        contentDescription = null,
                        tint = RoyColors.destructive,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(text = it, style = type.xs, color = RoyColors.destructive)
                }
            }
        }
    }
}

/** `72% مُستهلَك`, in ASCII digits whatever the device's locale is. */
@Composable
private fun BudgetPercent(spent: Double, budget: Double) {
    val type = LocalRoyTypeScale.current
    val percent =
        if (budget > 0) Math.round((spent / budget) * 100) else 0

    Text(
        text = SpendtrackBudgetCopy.PERCENT.replace("{percent}", percent.toString()),
        style = type.digits(type.xs.copy(fontWeight = FontWeight.Bold)),
        color = if (spent > budget) RoyColors.destructive else RoyColors.success,
        modifier = Modifier.width(96.dp),
    )
}
