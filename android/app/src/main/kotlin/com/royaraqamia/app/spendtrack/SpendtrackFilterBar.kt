package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The filter bar (#653), the app's half of
 * `frontend/ui/spendtrack/transaction-filters.tsx`.
 *
 * The site's four windows and four orders as chips and menus, its category
 * picker as a multi-select, and its search box. Everything here filters rows the
 * store already holds — the state never reaches the network — so a filter change
 * repaints in the frame it is chosen.
 *
 * The words are generated from the same source the site's bar reads, and the
 * clear action is drawn only when there is something to clear, which is the
 * site's own behaviour.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SpendtrackFilterBar(
    state: SpendtrackFilterState,
    categories: List<SpendtrackCategoryRow>,
    onChange: (SpendtrackFilterState) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    var categoryMenu by remember { mutableStateOf(false) }
    var sortMenu by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf(state.search) }

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                contentDescription = SpendtrackFiltersCopy.SECTION_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Calendar,
                contentDescription = SpendtrackFiltersCopy.RANGE_LABEL,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            for (range in SpendtrackRange.entries) {
                FilterChip(
                    selected = state.range == range,
                    onClick = { onChange(state.copy(range = range)) },
                    label = { Text(range.label, style = type.xs) },
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ExposedDropdownMenuBox(
                expanded = categoryMenu,
                onExpandedChange = { categoryMenu = it },
                modifier = Modifier.weight(1f),
            ) {
                OutlinedTextField(
                    value =
                        if (state.categories.isEmpty()) {
                            SpendtrackFiltersCopy.ALL_CATEGORIES
                        } else {
                            SpendtrackFiltersCopy.SELECTED_CATEGORIES.replace(
                                "{count}",
                                state.categories.size.toString(),
                            )
                        },
                    onValueChange = {},
                    readOnly = true,
                    singleLine = true,
                    leadingIcon = { Icon(LucideVectors.Tags, contentDescription = null) },
                    trailingIcon = {
                        Icon(LucideVectors.ChevronDown, contentDescription = null)
                    },
                    modifier =
                        Modifier.fillMaxWidth()
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
                )
                ExposedDropdownMenu(expanded = categoryMenu, onDismissRequest = { categoryMenu = false }) {
                    for (category in SpendtrackFilters.categoryChoices(categories)) {
                        val checked = state.categories.contains(category.id)
                        DropdownMenuItem(
                            text = {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    // The site ticks a chosen category with its own check
                                    // glyph; the checkbox is only the control that shows
                                    // the state.
                                    Icon(
                                        imageVector = LucideVectors.Check,
                                        contentDescription = null,
                                        tint = if (checked) RoyColors.primary else RoyColors.muted,
                                        modifier = Modifier.size(Recipes.Glyph.sm),
                                    )
                                    Checkbox(
                                        checked = checked,
                                        onCheckedChange = null,
                                        modifier = Modifier.size(20.dp),
                                    )
                                    Text(
                                        text = category.name,
                                        modifier = Modifier.padding(start = 8.dp),
                                        style = type.small,
                                    )
                                }
                            },
                            onClick = {
                                val next = state.categories.toMutableSet()
                                if (checked) next.remove(category.id) else next.add(category.id)
                                onChange(state.copy(categories = next))
                            },
                        )
                    }
                }
            }

            Box {
                TextButton(onClick = { sortMenu = true }) {
                    Icon(
                        imageVector = LucideVectors.ArrowUpDown,
                        contentDescription = SpendtrackFiltersCopy.SORT_LABEL,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                }
                androidx.compose.material3.DropdownMenu(
                    expanded = sortMenu,
                    onDismissRequest = { sortMenu = false },
                ) {
                    for (sort in SpendtrackSort.entries) {
                        DropdownMenuItem(
                            text = { Text(sort.label) },
                            onClick = {
                                onChange(state.copy(sort = sort))
                                sortMenu = false
                            },
                        )
                    }
                }
            }
        }

        OutlinedTextField(
            value = search,
            onValueChange = {
                search = it
                onChange(state.copy(search = it))
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            placeholder = { Text(SpendtrackFiltersCopy.SEARCH_PLACEHOLDER) },
            leadingIcon = { Icon(LucideVectors.Search, contentDescription = null) },
            trailingIcon = {
                if (search.isNotEmpty()) {
                    TextButton(
                        onClick = {
                            search = ""
                            onChange(state.copy(search = ""))
                        }
                    ) {
                        Icon(
                            imageVector = LucideVectors.X,
                            contentDescription = SpendtrackFiltersCopy.CLEAR_SEARCH,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )

        if (!state.isDefault) {
            TextButton(onClick = { onChange(SpendtrackFilterState()) }) {
                Icon(
                    imageVector = LucideVectors.RotateCcw,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = SpendtrackFiltersCopy.CLEAR,
                    modifier = Modifier.padding(start = 6.dp),
                    color = RoyColors.mutedForeground,
                )
            }
        }
    }
}
