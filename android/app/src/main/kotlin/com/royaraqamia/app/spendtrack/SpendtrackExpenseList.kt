package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * SpendTrack's expense list (#653), the app's half of
 * `frontend/ui/spendtrack/expense-list.tsx`.
 *
 * The rows are the site's rows: the category's dot, the description (or the
 * site's `بدون وصف`), the category's name, the day in the site's Hijri
 * sentence ([PlanDates.labelDay]), the amount in the site's currency format
 * ([SpendtrackMoney]), the split marker when the expense carries splits, and the
 * two actions — edit and delete.
 *
 * The words are `SpendtrackExpensesCopy`, generated from the same source the
 * site's list reads, so a label cannot be right on one client and wrong on the
 * other (ADR-0098). The list scrolls lazily: the whole owned set is on disk, and
 * a device with a year of expenses must still open at frame one.
 */
@Composable
fun SpendtrackExpenseList(
    state: SpendtrackExpensesUiState,
    categories: Map<String, SpendtrackCategoryRow>,
    currency: String?,
    onEdit: (SpendtrackExpenseRow) -> Unit,
    onDelete: (SpendtrackExpenseRow) -> Unit,
    modifier: Modifier = Modifier,
    header: (@Composable () -> Unit)? = null,
) {
    LazyColumn(
        // The site's list is one accessible node with its own name; the app's
        // scroll container says the same thing rather than reading every row as
        // an unnamed list (ADR-0098).
        modifier = modifier.fillMaxSize().semantics { contentDescription = SpendtrackExpensesCopy.LIST_LABEL },
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        if (header != null) item { header() }

        when (state) {
            is SpendtrackExpensesUiState.Empty -> item { EmptyExpenses() }
            is SpendtrackExpensesUiState.Painted ->
                items(state.rows, key = { it.id }) { row ->
                    ExpenseRowView(
                        row = row,
                        category = categories[row.categoryId],
                        currency = currency,
                        onEdit = { onEdit(row) },
                        onDelete = { onDelete(row) },
                    )
                }
        }
    }
}

/**
 * The site's empty state: the receipt glyph above the two sentences.
 *
 * The filtered variant the site also draws is not reachable here — the app has no
 * filter bar yet — so the app never paints words it cannot justify.
 */
@Composable
private fun EmptyExpenses() {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = LocalRoySpacing.current.sectionSm),
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = LucideVectors.Receipt,
            contentDescription = null,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.md),
        )
        Text(
            text = SpendtrackExpensesCopy.EMPTY_TITLE,
            style = type.body.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        Text(
            text = SpendtrackExpensesCopy.EMPTY_BODY,
            style = type.small,
            color = Recipes.Row.labelColor,
        )
    }
}

/** One expense, drawn the way the site draws it: identity at the start, money at the end. */
@Composable
private fun ExpenseRowView(
    row: SpendtrackExpenseRow,
    category: SpendtrackCategoryRow?,
    currency: String?,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    var confirming by remember { mutableStateOf(false) }
    val effectiveCurrency = row.currency ?: currency

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(spacing)),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(12.dp)
                    .clip(CircleShape)
                    .background(category?.let { colorOf(it.colorHex) } ?: RoyColors.muted),
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = row.description ?: SpendtrackExpensesCopy.NO_DESCRIPTION,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    category?.let {
                        Text(
                            text = it.name,
                            style = type.xs,
                            color = Recipes.Row.labelColor,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = PlanDates.labelDay(row.date),
                        style = type.xs,
                        color = Recipes.Row.labelColor,
                        maxLines = 1,
                    )
                }
                if (!row.splits.isNullOrEmpty()) {
                    Icon(
                        imageVector = LucideVectors.ChartPie,
                        // The splits themselves are drawn by the site; here the
                        // glyph says the row has more than one category, which is
                        // what the site's marker says too.
                        contentDescription = null,
                        tint = Recipes.Row.labelColor,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }

            Text(
                text = SpendtrackMoney.label(row.amount, effectiveCurrency),
                style = type.digits(type.small.copy(fontWeight = FontWeight.Bold)),
                color = RoyColors.foreground,
            )

            SpendtrackEditExpenseButton(onClick = onEdit)

            IconButton(onClick = onDelete) {
                Icon(
                    imageVector = LucideVectors.Trash,
                    contentDescription = SpendtrackExpensesCopy.DELETE_TITLE,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
        }
    }

    if (confirming) {
        DeleteExpenseDialog(
            onConfirm = {
                confirming = false
                onDelete()
            },
            onDismiss = { confirming = false },
        )
    }
}

/**
 * The site's confirmation dialog, in the site's words.
 *
 * The warning glyph is the site's own `AlertCircle`: the site draws it beside a
 * delete that failed, and here it marks the confirmation itself — the delete
 * this dialog confirms cannot fail, because it is a row in the device's store
 * before it is a request.
 */
@Composable
private fun DeleteExpenseDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val type = LocalRoyTypeScale.current
    var busy by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        shape = Recipes.Card.radius,
        containerColor = RoyColors.background,
        title = {
            Text(
                text = SpendtrackExpensesCopy.DELETE_TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
            )
        },
        text = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.CircleAlert,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = SpendtrackExpensesCopy.DELETE_BODY,
                    style = type.small,
                    color = Recipes.Row.labelColor,
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    busy = true
                    onConfirm()
                },
                enabled = !busy,
            ) {
                if (busy) {
                    Icon(
                        imageVector = LucideVectors.LoaderCircle,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = SpendtrackExpensesCopy.DELETING,
                        color = RoyColors.destructive,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                } else {
                    Text(SpendtrackExpensesCopy.DELETE_ACTION, color = RoyColors.destructive)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                // The app's generated "إلغاء": the same word, from the same
                // source, as every other native dialog (ADR-0098).
                Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
            }
        },
    )
}

/** A stored `#rrggbb` as a Compose colour; anything else is the muted surface. */
internal fun colorOf(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(RoyColors.muted)
