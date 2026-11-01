package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.background
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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The field the site's colour picker starts on (`create-category-dialog.tsx`). */
const val DEFAULT_CATEGORY_COLOR = "#8f6fe5"

/**
 * SpendTrack's category list (#653), the app's half of
 * `app/spendtrack/(app)/categories/category-list.tsx` and its create dialog.
 *
 * The rows are the site's rows: the colour dot, the name, the `افتراضي` badge on
 * a shared default, and the two actions. A default row belongs to nobody —
 * `user_id` is null — so it is drawn without the controls, exactly as the site
 * hides them.
 *
 * The words are `SpendtrackCategoriesCopy` and `SpendtrackCategoryCreateCopy`,
 * generated from the two sources the site reads, and every glyph is the site's
 * own (ADR-0100).
 */
@Composable
fun SpendtrackCategoryList(
    state: SpendtrackCategoriesUiState,
    onEdit: (SpendtrackCategoryRow) -> Unit,
    onDelete: (SpendtrackCategoryRow) -> Unit,
    modifier: Modifier = Modifier,
    header: (@Composable () -> Unit)? = null,
) {
    LazyColumn(
        // The site's list is one accessible node with its own name; the app's
        // scroll container says the same thing rather than reading every row as
        // an unnamed list (ADR-0098).
        modifier = modifier.fillMaxSize().semantics { contentDescription = SpendtrackCategoriesCopy.LIST_LABEL },
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        if (header != null) item { header() }

        when (state) {
            is SpendtrackCategoriesUiState.Empty -> item { EmptyCategories() }
            is SpendtrackCategoriesUiState.Painted ->
                items(state.rows, key = { it.id }) { row ->
                    CategoryRowView(
                        row = row,
                        onEdit = { onEdit(row) },
                        onDelete = { onDelete(row) },
                    )
                }
        }
    }
}

/** The site's empty state: the tag glyph above the two sentences. */
@Composable
private fun EmptyCategories() {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = LocalRoySpacing.current.sectionSm),
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = LucideVectors.Tags,
            contentDescription = null,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.md),
        )
        Text(
            text = SpendtrackCategoriesCopy.EMPTY_TITLE,
            style = type.body.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        Text(
            text = SpendtrackCategoriesCopy.EMPTY_BODY,
            style = type.small,
            color = Recipes.Row.labelColor,
        )
    }
}

/** One category: dot, name, the site's default badge, and the row's two actions. */
@Composable
private fun CategoryRowView(
    row: SpendtrackCategoryRow,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    var confirmingDelete by remember { mutableStateOf(false) }

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
                modifier =
                    Modifier.size(14.dp)
                        .clip(CircleShape)
                        .background(colorOf(row.colorHex)),
            )
            Text(
                modifier = Modifier.weight(1f),
                text = row.name,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (row.userId == null) {
                Text(
                    text = SpendtrackCategoriesCopy.DEFAULT_BADGE,
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                )
            } else {
                IconButton(onClick = onEdit) {
                    Icon(
                        imageVector = LucideVectors.Pencil,
                        contentDescription = SpendtrackCategoriesCopy.EDIT_TITLE,
                        tint = Recipes.Row.labelColor,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                }
                IconButton(onClick = { confirmingDelete = true }) {
                    Icon(
                        imageVector = LucideVectors.Trash,
                        contentDescription = SpendtrackCategoriesCopy.DELETE_TITLE,
                        tint = RoyColors.destructive,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                }
            }
        }
    }

    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            shape = Recipes.Card.radius,
            containerColor = RoyColors.background,
            title = {
                Text(
                    text = SpendtrackCategoriesCopy.DELETE_TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Text(
                    text = SpendtrackCategoriesCopy.DELETE_BODY,
                    style = type.small,
                    color = Recipes.Row.labelColor,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmingDelete = false
                        onDelete()
                    }
                ) {
                    Text(SpendtrackCategoriesCopy.DELETE_ACTION, color = RoyColors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) {
                    Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
                }
            },
        )
    }
}

/**
 * The site's create dialog: a name and a colour, and the two footer actions.
 *
 * The colour is typed (`#8f6fe5`) rather than picked from a wheel: the site's
 * `<input type="color">` is a platform control with no Compose counterpart, and
 * a hex field shows the stored value the store actually holds.
 */
@Composable
fun SpendtrackCategoryDialog(
    editing: SpendtrackCategoryRow?,
    onDismiss: () -> Unit,
    /** Returns false when the row was not written. */
    onSave: (name: String, colorHex: String) -> Boolean,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    var name by remember { mutableStateOf(editing?.name ?: "") }
    var colorHex by remember { mutableStateOf(editing?.colorHex ?: DEFAULT_CATEGORY_COLOR) }
    var busy by remember { mutableStateOf(false) }

    val canSave = name.isNotBlank() && isHexColor(colorHex) && !busy

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
                    if (editing == null) SpendtrackCategoryCreateCopy.CREATE_TITLE
                    else SpendtrackCategoriesCopy.EDIT_TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                singleLine = true,
                label = { Text(SpendtrackCategoriesCopy.NAME_LABEL) },
                placeholder = { Text(SpendtrackCategoryCreateCopy.NAME_PLACEHOLDER) },
                modifier = Modifier.fillMaxWidth(),
            )

            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier =
                        Modifier.size(24.dp)
                            .clip(CircleShape)
                            .background(
                                if (isHexColor(colorHex)) colorOf(colorHex) else RoyColors.muted
                            ),
                )
                OutlinedTextField(
                    value = colorHex,
                    onValueChange = { colorHex = it },
                    singleLine = true,
                    label = { Text(SpendtrackCategoriesCopy.COLOR_LABEL) },
                    modifier = Modifier.weight(1f),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss) {
                    Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
                }
                Button(
                    enabled = canSave,
                    onClick = {
                        busy = true
                        val saved = onSave(name.trim(), colorHex)
                        busy = false
                        if (saved) onDismiss()
                    },
                ) {
                    if (busy) {
                        Icon(
                            imageVector = LucideVectors.LoaderCircle,
                            contentDescription = null,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(
                            text =
                                if (editing == null) SpendtrackCategoryCreateCopy.CREATING
                                else SpendtrackCategoriesCopy.SAVING,
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    } else {
                        Text(
                            if (editing == null) SpendtrackCategoryCreateCopy.CREATE_ACTION
                            else SpendtrackCategoriesCopy.SAVE
                        )
                    }
                }
            }
        }
    }
}

/** The site's "add a category" control: the plus glyph and the site's words. */
@Composable
fun SpendtrackAddCategoryButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Button(onClick = onClick, modifier = modifier) {
        Icon(
            imageVector = LucideVectors.Plus,
            contentDescription = SpendtrackCategoryCreateCopy.ADD_ACTION,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = SpendtrackCategoryCreateCopy.ADD_ACTION,
            modifier = Modifier.padding(start = 8.dp),
        )
    }
}

/** `#rrggbb`, which is what the store and the site's colour input both hold. */
internal fun isHexColor(value: String): Boolean =
    Regex("^#[0-9a-fA-F]{6}$").matches(value.trim())
