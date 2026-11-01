package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackRecurringRow
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * SpendTrack's recurring expenses (#653), the app's half of
 * `frontend/ui/spendtrack/recurring-expenses.tsx`.
 *
 * The card's heading and its empty state, and then one row per schedule: the day
 * it falls on, the description (or the category's name, or the site's
 * `مصروف مُتكرِّر`), the category it is filed under and the amount in the site's
 * currency format — with the two actions the site offers, edit and delete.
 *
 * The dialog is the same one the site opens: amount, day of the month, category
 * and an optional description, validated with the site's own sentences, because a
 * bare "invalid" is a message a user cannot act on and a second wording is a
 * message that reads differently on the two clients.
 */
@Composable
fun SpendtrackRecurringCard(
    state: SpendtrackRecurringUiState,
    categories: List<SpendtrackCategoryRow>,
    currency: String?,
    onDelete: (SpendtrackRecurringRow) -> Unit,
    onEdit: (SpendtrackRecurringRow) -> Unit,
    onAdd: () -> Unit,
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
            verticalArrangement = Arrangement.spacedBy(Recipes.Card.gap(spacing)),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.Repeat,
                        contentDescription = null,
                        tint = RoyColors.primary,
                        modifier = Modifier.size(Recipes.Glyph.md),
                    )
                    Column {
                        Text(
                            text = SpendtrackRecurringCopy.TITLE,
                            style = type.small.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.foreground,
                        )
                        Text(
                            text = SpendtrackRecurringCopy.SUBTITLE,
                            style = type.xs,
                            color = Recipes.Row.labelColor,
                        )
                    }
                }
                Button(onClick = onAdd) {
                    Icon(
                        imageVector = LucideVectors.Plus,
                        contentDescription = SpendtrackRecurringCopy.CREATE_ACTION,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = SpendtrackRecurringCopy.ADD,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }

            when (state) {
                is SpendtrackRecurringUiState.Empty -> EmptyRecurring()
                is SpendtrackRecurringUiState.Painted ->
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                        for (row in state.rows) {
                            RecurringRowView(
                                row = row,
                                category = categories.firstOrNull { it.id == row.categoryId },
                                currency = currency,
                                onEdit = { onEdit(row) },
                                onDelete = { onDelete(row) },
                            )
                        }
                    }
            }
        }
    }
}

/** The site's empty card: the repeat glyph and its two sentences. */
@Composable
private fun EmptyRecurring() {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = LucideVectors.Repeat,
            contentDescription = null,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.md),
        )
        Text(
            text = SpendtrackRecurringCopy.EMPTY_TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        Text(
            text = SpendtrackRecurringCopy.EMPTY_BODY,
            style = type.xs,
            color = Recipes.Row.labelColor,
        )
    }
}

/** One schedule: the day, what it is, the category and the amount, and its two actions. */
@Composable
private fun RecurringRowView(
    row: SpendtrackRecurringRow,
    category: SpendtrackCategoryRow?,
    currency: String?,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.CalendarDays,
            contentDescription = SpendtrackRecurringCopy.DAY_LABEL,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = row.dayOfMonth.toString(),
            style = type.digits(type.xs.copy(fontWeight = FontWeight.Bold)),
            color = RoyColors.foreground,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = row.description ?: category?.name ?: SpendtrackRecurringCopy.FALLBACK,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            category?.let {
                Text(
                    text = it.name,
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Text(
            text = SpendtrackMoney.label(row.amount, currency),
            style = type.digits(type.small.copy(fontWeight = FontWeight.Bold)),
            color = RoyColors.foreground,
        )
        IconButton(onClick = onEdit) {
            Icon(
                imageVector = LucideVectors.Pencil,
                contentDescription = SpendtrackRecurringCopy.EDIT_ARIA,
                tint = Recipes.Row.labelColor,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
        IconButton(onClick = onDelete) {
            Icon(
                imageVector = LucideVectors.Trash,
                contentDescription = SpendtrackRecurringCopy.DELETE_ARIA,
                tint = RoyColors.destructive,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
    }
}

/**
 * The recurring form, in the site's fields and the site's validation sentences.
 *
 * `startMonth` is the month the schedule begins in: the site passes the month the
 * dashboard was opened on, and the server materialises the row from there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpendtrackRecurringDialog(
    editing: SpendtrackRecurringRow?,
    categories: List<SpendtrackCategoryRow>,
    onDismiss: () -> Unit,
    onSave: (
        amount: Double,
        categoryId: String,
        dayOfMonth: Long,
        description: String?,
    ) -> Boolean,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    var amount by remember { mutableStateOf(editing?.amount?.toString() ?: "") }
    var day by remember { mutableStateOf((editing?.dayOfMonth ?: 1L).toString()) }
    var categoryId by remember {
        mutableStateOf(editing?.categoryId ?: categories.firstOrNull()?.id ?: "")
    }
    var description by remember { mutableStateOf(editing?.description ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var categoryOpen by remember { mutableStateOf(false) }

    val chosen = categories.firstOrNull { it.id == categoryId }

    fun submit() {
        val parsed = parseAmount(amount)
        if (parsed == null) {
            error = SpendtrackRecurringCopy.INVALID_AMOUNT
            return
        }
        if (categoryId.isBlank()) {
            error = SpendtrackRecurringCopy.INVALID_CATEGORY
            return
        }
        val parsedDay = day.trim().toLongOrNull()
        if (parsedDay == null || parsedDay !in 1..31) {
            error = SpendtrackRecurringCopy.INVALID_DAY
            return
        }
        busy = true
        val saved = onSave(parsed, categoryId, parsedDay, description.trim().takeIf { it.isNotEmpty() })
        busy = false
        if (saved) onDismiss() else error = SpendtrackRecurringCopy.SAVE_ERROR
    }

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.background,
            border = Recipes.Card.border,
            modifier = Modifier.fillMaxWidth(0.94f),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Text(
                    text =
                        if (editing == null) SpendtrackRecurringCopy.CREATE_TITLE
                        else SpendtrackRecurringCopy.EDIT_TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                )

                OutlinedTextField(
                    value = amount,
                    onValueChange = {
                        amount = it
                        error = null
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    label = { Text(SpendtrackRecurringCopy.AMOUNT_LABEL) },
                    placeholder = { Text("0.00") },
                    modifier = Modifier.fillMaxWidth(),
                )

                OutlinedTextField(
                    value = day,
                    onValueChange = {
                        day = it
                        error = null
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    label = { Text(SpendtrackRecurringCopy.DAY_LABEL) },
                    leadingIcon = { Icon(LucideVectors.CalendarDays, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                )

                ExposedDropdownMenuBox(
                    expanded = categoryOpen,
                    onExpandedChange = { categoryOpen = it },
                ) {
                    OutlinedTextField(
                        value = chosen?.name.orEmpty(),
                        onValueChange = {},
                        readOnly = true,
                        singleLine = true,
                        label = { Text(SpendtrackRecurringCopy.CATEGORY_LABEL) },
                        placeholder = { Text(SpendtrackRecurringCopy.CATEGORY_PLACEHOLDER) },
                        leadingIcon = { Icon(LucideVectors.Tag, contentDescription = null) },
                        modifier =
                            Modifier.fillMaxWidth()
                                .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
                    )
                    ExposedDropdownMenu(
                        expanded = categoryOpen,
                        onDismissRequest = { categoryOpen = false },
                    ) {
                        for (category in categories) {
                            DropdownMenuItem(
                                text = { Text(category.name) },
                                onClick = {
                                    categoryId = category.id
                                    categoryOpen = false
                                    error = null
                                },
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    singleLine = true,
                    label = { Text(SpendtrackRecurringCopy.DESCRIPTION_LABEL) },
                    placeholder = { Text(SpendtrackRecurringCopy.DESCRIPTION_PLACEHOLDER) },
                    leadingIcon = { Icon(LucideVectors.FileText, contentDescription = null) },
                    modifier = Modifier.fillMaxWidth(),
                )

                error?.let {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = LucideVectors.CircleAlert,
                            contentDescription = null,
                            tint = RoyColors.destructive,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(text = it, style = type.xs, color = RoyColors.destructive)
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
                    }
                    Button(onClick = ::submit, enabled = !busy) {
                        if (busy) {
                            Icon(
                                imageVector = LucideVectors.LoaderCircle,
                                contentDescription = null,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                            Text(
                                text = SpendtrackRecurringCopy.SAVING,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        } else {
                            Text(
                                if (editing == null) SpendtrackRecurringCopy.CREATE_ACTION
                                else SpendtrackRecurringCopy.SAVE
                            )
                        }
                    }
                }
            }
        }
    }
}
