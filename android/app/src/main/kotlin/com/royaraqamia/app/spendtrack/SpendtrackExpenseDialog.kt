package com.royaraqamia.app.spendtrack

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.shared.CurrencySymbols
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.util.Calendar

/**
 * SpendTrack's expense form (#653), the app's half of
 * `frontend/ui/spendtrack/expense-dialog.tsx`.
 *
 * The same fields as the site, in the same order: amount (with the currency's
 * symbol in the label), category, date, description, and the account currency.
 * The words are `SpendtrackExpenseDialogCopy` from the same source the site's
 * dialog reads, and every glyph is the site's own — dollar, tag, calendar,
 * document, coins, plus, pencil, the spinner and the alert — rather than a
 * Material drawing that means the same thing (ADR-0100).
 *
 * What it does **not** carry is the site's split editor: the app re-sends the
 * splits an expense already has, untouched, and editing them is a later pair.
 * The amount is parsed as ASCII; a device set to an Arabic keyboard can still
 * type Arabic-Indic digits, so they are folded to ASCII before parsing rather
 * than rejected (ADR-0054, `shared/contracts/text.ts` on the web).
 */
@Composable
fun SpendtrackExpenseDialog(
    editing: SpendtrackExpenseRow?,
    categories: List<SpendtrackCategoryRow>,
    currency: String?,
    onDismiss: () -> Unit,
    /** Returns false when the row was not written, which the form reports inline. */
    onSave: (amount: Double, categoryId: String, date: String, description: String?, currency: String?) -> Boolean,
) {
    val type = LocalRoyTypeScale.current
    val context = LocalContext.current

    var amount by remember { mutableStateOf(editing?.amount?.toString() ?: "") }
    var categoryId by remember {
        mutableStateOf(editing?.categoryId ?: categories.firstOrNull()?.id ?: "")
    }
    var date by remember { mutableStateOf(editing?.date ?: todayIso()) }
    var description by remember { mutableStateOf(editing?.description ?: "") }
    var currencyChoice by remember { mutableStateOf(editing?.currency ?: "") }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    var showValidation by remember { mutableStateOf(false) }

    val formState: SpendtrackExpenseFormUiState =
        if (busy) SpendtrackExpenseFormUiState.Busy else SpendtrackExpenseFormUiState.Idle
    val parsed = parseAmount(amount)
    val amountRefused = showValidation && parsed == null
    val categoryRefused = showValidation && categoryId.isBlank()

    val effectiveCurrency = currencyChoice.takeIf { it.isNotBlank() } ?: currency
    val symbol = effectiveCurrency?.let { CurrencySymbols.byCode[it]?.symbol } ?: ""
    val amountLabel =
        SpendtrackExpenseDialogCopy.AMOUNT_LABEL + (if (symbol.isEmpty()) "" else " ($symbol)")

    Surface(
        shape = RoundedCornerShape(SpendtrackMetrics.DIALOG_RADIUS),
        color = RoyColors.background,
        border = Recipes.Card.border,
        modifier =
            Modifier.width(SpendtrackMetrics.DIALOG_WIDTH)
                .testTag(SpendtrackMetrics.EXPENSE_DIALOG),
    ) {
        Column(
            modifier =
                Modifier.padding(SpendtrackMetrics.DIALOG_PADDING)
                    .verticalScroll(rememberScrollState())
                    .testTag(SpendtrackMetrics.EXPENSE_FORM),
            verticalArrangement = Arrangement.spacedBy(SpendtrackMetrics.EXPENSE_FORM_GAP),
        ) {
            FieldGroup(
                label = amountLabel,
                icon = LucideVectors.DollarSign,
                trailing = effectiveCurrency?.let { CurrencySymbols.byCode[it]?.name },
                error = if (amountRefused) SpendtrackExpenseDialogCopy.AMOUNT_REQUIRED else null,
                errorTag = SpendtrackMetrics.EXPENSE_ERROR,
                errorLineHeight = SpendtrackMetrics.EXPENSE_ERROR_LINE,
                errorHeight = SpendtrackMetrics.EXPENSE_ERROR_HEIGHT,
            ) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = {
                        amount = it
                        failed = false
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    placeholder = { Text("0.00") },
                    shape = RoundedCornerShape(SpendtrackMetrics.FIELD_RADIUS),
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.FIELD_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_AMOUNT),
                )
            }

            FieldGroup(
                label = SpendtrackExpenseDialogCopy.CATEGORY_LABEL,
                icon = LucideVectors.Tag,
                error = if (categoryRefused) SpendtrackExpenseDialogCopy.CATEGORY_REQUIRED else null,
                errorTag = null,
                errorLineHeight = SpendtrackMetrics.EXPENSE_ERROR_LINE,
                errorHeight = SpendtrackMetrics.EXPENSE_ERROR_HEIGHT,
            ) {
                CategoryField(
                    categories = categories,
                    selected = categoryId,
                    onSelect = { categoryId = it },
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.FIELD_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_CATEGORY),
                )
            }

            FieldGroup(
                label = SpendtrackExpenseDialogCopy.DATE_LABEL,
                icon = LucideVectors.Calendar,
                error = null,
                errorTag = null,
                errorLineHeight = SpendtrackMetrics.EXPENSE_ERROR_LINE,
                errorHeight = SpendtrackMetrics.EXPENSE_ERROR_HEIGHT,
            ) {
                OutlinedTextField(
                    value = date,
                    onValueChange = { date = it },
                    readOnly = true,
                    singleLine = true,
                    placeholder = { Text(SpendtrackExpenseDialogCopy.DATE_PLACEHOLDER) },
                    shape = RoundedCornerShape(SpendtrackMetrics.FIELD_RADIUS),
                    trailingIcon = {
                        IconButton(
                            onClick = {
                                val parts = date.split("-").mapNotNull { it.toIntOrNull() }
                                val dialog =
                                    DatePickerDialog(
                                        context,
                                        { _, year, month, day ->
                                            date = isoDay(year, month + 1, day)
                                        },
                                        parts.getOrElse(0) { 2026 },
                                        (parts.getOrElse(1) { 1 }) - 1,
                                        parts.getOrElse(2) { 1 },
                                    )
                                dialog.show()
                            }
                        ) {
                            Icon(
                                LucideVectors.Calendar,
                                contentDescription = SpendtrackExpenseDialogCopy.DATE_PLACEHOLDER,
                            )
                        }
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.FIELD_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_DATE),
                )
            }

            FieldGroup(
                label =
                    SpendtrackExpenseDialogCopy.DESCRIPTION_LABEL +
                        " " + SpendtrackExpenseDialogCopy.OPTIONAL,
                icon = LucideVectors.FileText,
                error = null,
                errorTag = null,
                errorLineHeight = SpendtrackMetrics.EXPENSE_ERROR_LINE,
                errorHeight = SpendtrackMetrics.EXPENSE_ERROR_HEIGHT,
                required = false,
            ) {
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    singleLine = true,
                    placeholder = { Text(SpendtrackExpenseDialogCopy.DESCRIPTION_PLACEHOLDER) },
                    shape = RoundedCornerShape(SpendtrackMetrics.FIELD_RADIUS),
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.FIELD_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_DESCRIPTION),
                )
            }

            FieldGroup(
                label =
                    SpendtrackExpenseDialogCopy.CURRENCY_LABEL +
                        " " + SpendtrackExpenseDialogCopy.OPTIONAL,
                icon = LucideVectors.Coins,
                error = null,
                errorTag = null,
                errorLineHeight = SpendtrackMetrics.EXPENSE_ERROR_LINE,
                errorHeight = SpendtrackMetrics.EXPENSE_ERROR_HEIGHT,
                required = false,
            ) {
                CurrencyField(
                    choice = currencyChoice,
                    accountCurrency = currency,
                    onSelect = { currencyChoice = it },
                    onInherit = { currencyChoice = "" },
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.FIELD_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_CURRENCY),
                )
            }

            if (failed) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        LucideVectors.CircleAlert,
                        contentDescription = null,
                        tint = RoyColors.destructive,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        text = SpendtrackExpenseDialogCopy.ERROR_LABEL,
                        style = type.xs,
                        color = RoyColors.destructive,
                    )
                }
            }

            Column(
                modifier =
                    Modifier.fillMaxWidth()
                        .testTag(SpendtrackMetrics.EXPENSE_ACTIONS)
                        .padding(top = SpendtrackMetrics.ACTION_TOP_PADDING),
                verticalArrangement = Arrangement.spacedBy(SpendtrackMetrics.ACTION_GAP),
            ) {
                Button(
                    enabled = !busy,
                    onClick = {
                        if (parsed == null || categoryId.isBlank() || date.isBlank()) {
                            showValidation = true
                            return@Button
                        }
                        busy = true
                        val saved =
                            onSave(
                                parsed,
                                categoryId,
                                date,
                                description.trim().takeIf { it.isNotEmpty() },
                                currencyChoice.takeIf { it.isNotBlank() },
                            )
                        busy = false
                        if (saved) {
                            onDismiss()
                        } else {
                            failed = true
                        }
                    },
                    shape = RoundedCornerShape(999.dp),
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.ACTION_SUBMIT_HEIGHT)
                            .testTag(SpendtrackMetrics.EXPENSE_SUBMIT),
                ) {
                    if (formState is SpendtrackExpenseFormUiState.Busy) {
                        Icon(
                            LucideVectors.LoaderCircle,
                            contentDescription = null,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(SpendtrackExpenseDialogCopy.SAVING, modifier = Modifier.padding(start = 8.dp))
                    } else {
                        Text(
                            if (editing == null) SpendtrackExpenseDialogCopy.ADD_ACTION
                            else SpendtrackExpenseDialogCopy.SAVE
                        )
                    }
                }
                TextButton(
                    onClick = onDismiss,
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SpendtrackMetrics.ACTION_CANCEL_HEIGHT),
                ) {
                    Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
                }
            }
        }
    }
}

/** One label, its field and the sentence the page draws when the field is refused. */
@Composable
private fun FieldGroup(
    label: String,
    icon: ImageVector,
    error: String?,
    errorTag: String?,
    errorLineHeight: TextUnit,
    errorHeight: Dp,
    trailing: String? = null,
    required: Boolean = true,
    field: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = label,
                    style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                )
                if (required) {
                    Text(
                        text = "*",
                        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.destructive,
                    )
                }
            }
            if (trailing != null) {
                Text(
                    text = trailing,
                    style = LocalRoyTypeScale.current.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }
        field()
        if (error != null) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier =
                    (if (errorTag != null) Modifier.testTag(errorTag) else Modifier)
                        .height(errorHeight),
            ) {
                Icon(
                    LucideVectors.CircleAlert,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = error,
                    style = LocalRoyTypeScale.current.xs.copy(lineHeight = errorLineHeight),
                    color = RoyColors.destructive,
                )
            }
        }
    }
}

/** The site's "add an expense" trigger: the plus glyph and the site's words. */
@Composable
fun SpendtrackAddExpenseButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(onClick = onClick, modifier = modifier) {
        Icon(
            imageVector = LucideVectors.Plus,
            contentDescription = SpendtrackExpenseDialogCopy.ADD_ARIA,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = SpendtrackExpenseDialogCopy.ADD_ACTION,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/**
 * The site's "edit this expense" trigger: the pencil, announced by the site's
 * own words.
 *
 * It lives beside the dialog rather than inside the row because it *is* the
 * dialog's other half: on the site the same file exports both, and a row that
 * drew its own pencil would be a second drawing of the same control.
 */
@Composable
fun SpendtrackEditExpenseButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    IconButton(onClick = onClick, modifier = modifier) {
        Icon(
            imageVector = LucideVectors.Pencil,
            contentDescription = SpendtrackExpenseDialogCopy.EDIT_TITLE,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
    }
}

/** The category picker: the tag glyph, the chosen row's dot, and the site's names. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoryField(
    categories: List<SpendtrackCategoryRow>,
    selected: String,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val chosen = categories.firstOrNull { it.id == selected }

    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = chosen?.name.orEmpty(),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            placeholder = { Text(SpendtrackExpenseDialogCopy.CATEGORY_PLACEHOLDER) },
            shape = RoundedCornerShape(SpendtrackMetrics.FIELD_RADIUS),
            modifier =
                modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            for (category in categories) {
                DropdownMenuItem(
                    text = {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier =
                                    Modifier.size(10.dp)
                                        .clip(CircleShape)
                                        .background(colorOf(category.colorHex)),
                            )
                            Text(category.name)
                        }
                    },
                    onClick = {
                        onSelect(category.id)
                        open = false
                    },
                )
            }
        }
    }
}

/**
 * The currency picker: the site's coins glyph, "inherit the account currency"
 * first, then the currencies the site's form offers — each labelled with the
 * name and symbol the site shows, from the generated table.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CurrencyField(
    choice: String,
    accountCurrency: String?,
    onSelect: (String) -> Unit,
    onInherit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    val selected = choice.takeIf { it.isNotBlank() }
    val inheritLabel =
        SpendtrackExpenseDialogCopy.CURRENCY_INHERIT.replace(
            "{symbol}",
            accountCurrency?.let { CurrencySymbols.byCode[it]?.symbol }.orEmpty(),
        )

    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value =
                selected?.let { code ->
                    val info = CurrencySymbols.byCode[code]
                    if (info == null) code else "${info.symbol} — ${info.name} ($code)"
                }.orEmpty(),
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            placeholder = { Text(inheritLabel) },
            shape = RoundedCornerShape(SpendtrackMetrics.FIELD_RADIUS),
            modifier =
                modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(inheritLabel) },
                onClick = {
                    onInherit()
                    open = false
                },
            )
            for (code in CurrencySymbols.expenseCodes) {
                val info = CurrencySymbols.byCode[code] ?: continue
                DropdownMenuItem(
                    text = { Text("${info.symbol} — ${info.name} ($code)") },
                    onClick = {
                        onSelect(code)
                        open = false
                    },
                )
            }
        }
    }
        Text(
            text = SpendtrackExpenseDialogCopy.CURRENCY_HINT,
            style = LocalRoyTypeScale.current.xs,
            color = RoyColors.mutedForeground,
        )
    }
}

/** `2026-01-31` for the picker's answer, in ASCII digits. */
private fun isoDay(year: Int, month: Int, day: Int): String =
    String.format(java.util.Locale.ROOT, "%04d-%02d-%02d", year, month, day)

/** Today in the device's zone, the way the store dates a new expense. */
private fun todayIso(): String {
    val calendar = Calendar.getInstance()
    return isoDay(
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH),
    )
}

/**
 * An amount typed on this device as a number the store can hold.
 *
 * Arabic-Indic and Persian digits are folded to ASCII before parsing — the site
 * does the same in `toLatinDigits` — and a value that is not a positive number is
 * null, which is what draws the page's own refused sentence under the field.
 */
internal fun parseAmount(text: String): Double? {
    val ascii = buildString {
        for (character in text.trim()) {
            append(
                when (character) {
                    in '٠'..'٩' -> ('0' + (character - '٠'))
                    in '۰'..'۹' -> ('0' + (character - '۰'))
                    '٫', '،' -> '.'
                    else -> character
                }
            )
        }
    }.replace(",", "")
    return ascii.toDoubleOrNull()?.takeIf { it > 0 }
}
