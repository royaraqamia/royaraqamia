package com.royaraqamia.app.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.account.AvatarLoader
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.connectedapps.InboundTab
import com.royaraqamia.app.mcp.MarketplaceTab
import com.royaraqamia.app.mcp.McpStoreRepository
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.ui.vectors.LucideVectors
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected

/**
 * What a picker row's action is showing (#1194, ADR-0146).
 *
 * [Add] is the site's violet "add this app"; [Remove] is its emerald "it is on
 * your homepage", with a tick. The names are the parity row's states, so a state
 * one client can draw and the other cannot is visible to `check:parity` rather
 * than to a user. A refused write is the sheet's line, not a row state.
 */
sealed interface PickerRowState {
    data object Add : PickerRowState

    data object Remove : PickerRowState
}

/** The site's Tailwind palette for the picker, which the token set does not name. */
private object PickerColors {
    val Violet200 = Color(0xFFDDD6FE)
    val Violet500 = Color(0xFF8B5CF6)
    val Emerald300 = Color(0xFF6EE7B7)
    val Emerald500 = Color(0xFF10B981)
    val Red300 = Color(0xFFFCA5A5)
    val Divider = Color(0xFF262626)
}

/** The picker's own geometry, read from the page's classes (ADR-0118). */
internal object PickerMetrics {
    val rowHorizontalPadding = 16.dp
    val rowVerticalPadding = 4.dp
    val rowHeight = 53.dp
    val lastRowHeight = 52.dp
    val listPaddingHorizontal = 12.dp
    val listPaddingTop = 12.dp

    /** The site's sheet border and the header's hairline: two rows above the list's own padding. */
    val topRules = 2.dp
    val listPaddingBottom = 6.dp
    val rowActionMinHeight = 36.dp
    val rowActionMinWidth = 80.dp
    val rowActionHorizontalPadding = 12.dp
    val rowActionTextSize = 12.sp
    val actionGap = 6.dp
    val checkSize = 14.dp
    val iconSize = 16.dp
    val iconGap = 10.dp
    val labelTextSize = 14.sp
    val labelVerticalPadding = 12.dp
    val errorTopPadding = 8.dp
    val errorTextSize = 12.sp
    val borderWidth = 1.dp
    val sheetRadius = 16.dp

}


/**
 * The apps surface as a full-height sheet (#1256, ADR-0159).
 *
 * The site's sheet is the one apps surface: a title with a close control, three
 * tabs, one search field and one scroll body
 * (frontend/ui/navbar/ServicesSheet.tsx and frontend/ui/apps/apps-surface.tsx).
 * The app draws the same surface — full height, no grabber, the picker under
 * the tabs — so the two hosts of one surface cannot drift apart.
 *
 * All three tabs are panels since #1256: the picker, the store
 * (`mcp/MarketplaceTab.kt`) and the connected clients
 * (`connectedapps/InboundTab.kt`), each filtered by the surface's one field. The
 * picker keeps its rule: one write at a time, and a refused write is the sheet's
 * own line, cleared by the next attempt.
 */
@Composable
fun ServicesSheet(
    open: Boolean,
    order: List<String>,
    busy: String?,
    error: String?,
    onToggle: (String) -> Unit,
    onDismiss: () -> Unit,
    /** The store tab's panel: its data side, drawn here rather than routed to (#1256). */
    marketplace: McpStoreRepository? = null,
    signedIn: Boolean = false,
    onSignIn: () -> Unit = {},
    /** The connection a store row opens (`/mcp/apps/<id>`), still the document. */
    onOpenConnection: (String) -> Unit = {},
    /** The provider's consent page: a third-party origin the browser visits. */
    onOpenExternal: (String) -> Unit = {},
    /** Reads a catalogue row's brand mark; null draws the monogram alone. */
    brandMark: AvatarLoader? = null,
    /** The connected list's data (#1256): the same card the account screen draws. */
    connectedApps: ConnectedAppsRepository? = null,
    /** The page's "connect a new client": the MCP guide, still the document. */
    onConnectNew: () -> Unit = {},
) {
    if (!open) return

    // A sheet is a screen while it is open: back closes it rather than walking the
    // route underneath (ADR-0082).
    BackHandler(enabled = true, onBack = onDismiss)

    var tab by remember { mutableStateOf<AppsSheetTab>(AppsSheetTab.Internal) }
    var query by remember { mutableStateOf("") }

    Box(Modifier.fillMaxSize()) {
        // bg-black/75, the scrim the site's sheets draw. A full-height sheet
        // covers it, so what is left is the tap that dismisses.
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.75f))
                .pointerInput(Unit) { detectTapGestures { onDismiss() } }
        )
        Surface(
            modifier =
                Modifier.fillMaxSize()
                    .testTag("services-sheet")
                    .semantics { paneTitle = ServicesSheetCopy.TITLE },
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                Modifier.fillMaxSize()
                    .windowInsetsPadding(WindowInsets.statusBars.only(WindowInsetsSides.Top))
            ) {
                SheetHeader(onDismiss)

                Column(
                    Modifier.fillMaxWidth()
                        .padding(
                            start = AppsSheetMetrics.bandPadding,
                            end = AppsSheetMetrics.bandPadding,
                            top = AppsSheetMetrics.bandPaddingTop,
                            bottom = AppsSheetMetrics.bandPadding,
                        ),
                    verticalArrangement = Arrangement.spacedBy(AppsSheetMetrics.bandGap),
                ) {
                    AppsTabs(
                        tab = tab,
                        onSelect = { chosen ->
                            when (chosen) {
                                AppsSheetTab.Internal -> tab = AppsSheetTab.Internal
                                AppsSheetTab.External -> tab = AppsSheetTab.External
                                AppsSheetTab.Inbound -> tab = AppsSheetTab.Inbound
                            }
                        },
                    )
                    // The surface owns the field and asks the active tab for its
                    // placeholder, as the page does (#1256).
                    SearchField(
                        query = query,
                        onQueryChange = { query = it },
                        placeholder =
                            when (tab) {
                                AppsSheetTab.Internal -> AppsSheetCopy.SEARCH_INTERNAL
                                AppsSheetTab.External -> AppsSheetCopy.SEARCH_STORE
                                AppsSheetTab.Inbound -> AppsSheetCopy.SEARCH_INBOUND
                            },
                    )
                }

                Box(
                    Modifier.fillMaxWidth()
                        .height(PickerMetrics.borderWidth)
                        .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                )

                if (tab == AppsSheetTab.Internal || (tab == AppsSheetTab.External && marketplace == null) || (tab == AppsSheetTab.Inbound && connectedApps == null)) {
                    Column(
                        Modifier.fillMaxWidth()
                            .weight(1f)
                            .verticalScroll(rememberScrollState())
                            .navigationBarsPadding()
                            .padding(
                                start = PickerMetrics.listPaddingHorizontal,
                                end = PickerMetrics.listPaddingHorizontal,
                                top = PickerMetrics.listPaddingTop,
                                bottom = AppsSheetMetrics.bodyPaddingBottom,
                            )
                    ) {
                        val term = query.trim()
                        val rows =
                            ServicesEntry.rows.filter { entry ->
                                term.isEmpty() || labelOf(entry).contains(term)
                            }

                        rows.forEachIndexed { index, entry ->
                            PickerRow(
                                entry = entry,
                                added = entry.route in order,
                                pending = busy == entry.route,
                                enabled = busy == null,
                                last = index == rows.lastIndex,
                                onToggle = { onToggle(entry.route) },
                            )
                        }

                        if (rows.isEmpty()) {
                            Text(
                                text = ServicesSheetCopy.SEARCH_EMPTY_INTERNAL,
                                style =
                                    MaterialTheme.typography.labelSmall.copy(
                                        fontSize = PickerMetrics.errorTextSize,
                                        lineHeight = 16.sp,
                                    ),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier =
                                    Modifier.fillMaxWidth()
                                        .padding(
                                            top = AppsSheetMetrics.emptyTopPadding,
                                            start = PickerMetrics.rowHorizontalPadding,
                                            end = PickerMetrics.rowHorizontalPadding,
                                        ),
                                maxLines = 2,
                                textAlign = TextAlign.Center,
                            )
                        }

                        // The page's line is a block that only has its top padding when
                        // there is nothing to say (whitespace collapses), so a quiet
                        // sheet stays shorter than one drawing a refusal.
                        if (error != null) {
                            Text(
                                text = error,
                                style =
                                    MaterialTheme.typography.labelSmall.copy(
                                        fontSize = PickerMetrics.errorTextSize,
                                        lineHeight = 16.sp,
                                    ),
                                color = PickerColors.Red300,
                                modifier =
                                    Modifier.fillMaxWidth()
                                        .padding(
                                            top = PickerMetrics.errorTopPadding,
                                            start = PickerMetrics.rowHorizontalPadding,
                                            end = PickerMetrics.rowHorizontalPadding,
                                        ),
                                maxLines = 2,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                } else if (tab == AppsSheetTab.External) {
                    // The store is a panel, not a door (#1256): the surface's field
                    // is its search, and the body scrolls inside the tab.
                    MarketplaceTab(
                        repository = marketplace!!,
                        query = query,
                        signedIn = signedIn,
                        onSignIn = onSignIn,
                        onOpenConnection = onOpenConnection,
                        onOpenExternal = onOpenExternal,
                        brandMark = brandMark,
                        modifier = Modifier.fillMaxSize().weight(1f),
                    )
                } else {
                    // The connected clients are the same card the account screen
                    // draws, under the same field (#1256).
                    InboundTab(
                        repository = connectedApps!!,
                        signedIn = signedIn,
                        query = query,
                        onSignIn = onSignIn,
                        onConnectNew = onConnectNew,
                        modifier = Modifier.fillMaxSize().weight(1f),
                    )
                }
            }
        }
    }
}

/** The sheet's title and its close control, in the site's order. */
@Composable
private fun SheetHeader(onDismiss: () -> Unit) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .padding(
                    start = AppsSheetMetrics.headerPadding,
                    end = AppsSheetMetrics.headerPaddingEnd,
                    top = AppsSheetMetrics.headerPaddingTop,
                    bottom = AppsSheetMetrics.headerPaddingBottom,
                ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = ServicesSheetCopy.TITLE,
            style =
                MaterialTheme.typography.titleLarge.copy(
                    fontSize = AppsSheetMetrics.titleTextSize,
                    fontWeight = FontWeight.ExtraBold,
                ),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
            maxLines = 1,
        )
        Box(
            modifier =
                Modifier.size(AppsSheetMetrics.closeSize)
                    .clip(RoundedCornerShape(percent = 50))
                    .clickable(onClick = onDismiss)
                    .semantics { role = Role.Button }
                    .testTag("apps-sheet-close"),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.X,
                // Closing a sheet is the same step back the shell's control names.
                contentDescription = BackControlCopy.LABEL,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(AppsSheetMetrics.closeIconSize),
            )
        }
    }
}

/**
 * The surface's three tabs as the site's chips (TabChips, ADR-0146): one
 * scroller, the active chip in the page's ink.
 *
 * The page's chip is `min-h-10 rounded-full border px-4 text-sm font-bold`, the
 * active one filled with the foreground ink and the rest outlined — the same on
 * the page and in the sheet, because the two hosts draw one chip (#1256).
 */
@Composable
private fun AppsTabs(tab: AppsSheetTab, onSelect: (AppsSheetTab) -> Unit) {
    val tabs =
        listOf(
            AppsSheetTab.Internal to AppsSheetCopy.TAB_INTERNAL,
            AppsSheetTab.External to AppsSheetCopy.TAB_EXTERNAL,
            AppsSheetTab.Inbound to AppsSheetCopy.TAB_INBOUND,
        )
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .semantics { contentDescription = AppsSheetCopy.TABS_LABEL },
        horizontalArrangement = Arrangement.spacedBy(AppsSheetMetrics.tabGap),
    ) {
        tabs.forEach { (id, label) ->
            val active = id == tab
            val shape = RoundedCornerShape(percent = 50)
            Box(
                modifier =
                    Modifier.heightIn(min = AppsSheetMetrics.tabMinHeight)
                        .clip(shape)
                        .background(if (active) MaterialTheme.colorScheme.onSurface else Color.Transparent)
                        .border(
                            width = PickerMetrics.borderWidth,
                            color =
                                if (active) {
                                    Color.Transparent
                                } else {
                                    MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
                                },
                            shape = shape,
                        )
                        .clickable { onSelect(id) }
                        .semantics { selected = active }
                        .testTag("apps-tab")
                        .padding(horizontal = AppsSheetMetrics.tabHorizontalPadding),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    style =
                        MaterialTheme.typography.labelMedium.copy(
                            fontSize = AppsSheetMetrics.tabTextSize,
                            fontWeight = FontWeight.Bold,
                        ),
                    color =
                        if (active) {
                            MaterialTheme.colorScheme.surface
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                    maxLines = 1,
                )
            }
        }
    }
}

/**
 * The one search field, in the tab's own words.
 *
 * The page draws an `<input type="search">` inside a bordered, 12px-rounded box
 * with the glyph at the inline start and the text 36px in (`apps-surface.tsx`:
 * `py-2.5 pe-3 ps-9 text-sm`), which is 42px tall. Material's `OutlinedTextField`
 * cannot be that height - its minimum is 56 - so the field is drawn from the box
 * the page draws rather than from the component the app happens to ship.
 */
@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit, placeholder: String) {
    val shape = RoundedCornerShape(AppsSheetMetrics.searchRadius)
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .height(AppsSheetMetrics.searchHeight)
                .clip(shape)
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f))
                .border(
                    width = PickerMetrics.borderWidth,
                    color = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f),
                    shape = shape,
                )
                .testTag("apps-search")
                .semantics { contentDescription = AppsSheetCopy.SEARCH_LABEL },
    ) {
        Icon(
            imageVector = LucideVectors.Search,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier =
                Modifier.align(Alignment.CenterStart)
                    .padding(start = AppsSheetMetrics.searchIconInset)
                    .size(PickerMetrics.iconSize),
        )
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier =
                Modifier.fillMaxSize()
                    .padding(
                        start = AppsSheetMetrics.searchTextInset,
                        end = AppsSheetMetrics.searchEndInset,
                    )
                    .testTag("apps-search-input"),
            singleLine = true,
            textStyle =
                MaterialTheme.typography.bodySmall.copy(
                    fontSize = AppsSheetMetrics.searchTextSize,
                    color = MaterialTheme.colorScheme.onSurface,
                ),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            decorationBox = { inner ->
                Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            text = placeholder,
                            style =
                                MaterialTheme.typography.bodySmall.copy(
                                    fontSize = AppsSheetMetrics.searchTextSize,
                                ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            maxLines = 1,
                        )
                    }
                    inner()
                }
            },
        )
    }
}

/** The surface's own geometry, read from the page's classes (ADR-0118). */
internal object AppsSheetMetrics {
    val headerPadding = 16.dp
    val headerPaddingEnd = 8.dp
    val headerPaddingTop = 12.dp
    val headerPaddingBottom = 8.dp
    val titleTextSize = 18.sp
    val closeSize = 28.dp
    val closeIconSize = 20.dp

    val bandPadding = 12.dp
    val bandPaddingTop = 12.dp
    val bandGap = 8.dp
    val tabGap = 8.dp
    val tabHorizontalPadding = 16.dp
    val tabMinHeight = 40.dp
    val tabTextSize = 14.sp

    val searchHeight = 42.dp
    val searchIconInset = 12.dp
    val searchTextInset = 36.dp
    val searchEndInset = 12.dp
    val searchRadius = 12.dp
    val searchTextSize = 14.sp

    val emptyTopPadding = 24.dp
    val bodyPaddingBottom = 12.dp
}


@Composable
private fun PickerRow(
    entry: ServicesEntry,
    added: Boolean,
    pending: Boolean,
    enabled: Boolean,
    last: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .height(if (last) PickerMetrics.lastRowHeight else PickerMetrics.rowHeight)
                .testTag("services-row")
                .bottomHairline(last)
                .padding(
                    horizontal = PickerMetrics.rowHorizontalPadding,
                    vertical = PickerMetrics.rowVerticalPadding,
                ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier =
                Modifier.weight(1f).padding(vertical = PickerMetrics.labelVerticalPadding),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PickerMetrics.iconGap),
        ) {
            Icon(
                imageVector = iconOf(entry),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(PickerMetrics.iconSize),
            )
            Text(
                text = labelOf(entry),
                style =
                    MaterialTheme.typography.bodyMedium.copy(
                        fontSize = PickerMetrics.labelTextSize,
                        fontWeight = FontWeight.Medium,
                    ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
        }

        PickerAction(
            state = if (added) PickerRowState.Remove else PickerRowState.Add,
            pending = pending,
            enabled = enabled,
            onToggle = onToggle,
        )
    }
}
/** The site's action pill, in its two colours. */@Composable
private fun PickerAction(
    state: PickerRowState,
    pending: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val added = state is PickerRowState.Remove
    val shape = RoundedCornerShape(percent = 50)

    Row(
        modifier =
            Modifier.heightIn(min = PickerMetrics.rowActionMinHeight)
                .widthIn(min = PickerMetrics.rowActionMinWidth)
                .clip(shape)
                .background(
                    if (added) {
                        PickerColors.Emerald500.copy(alpha = 0.10f)
                    } else {
                        PickerColors.Violet500.copy(alpha = 0.15f)
                    }
                )
                .border(
                    width = PickerMetrics.borderWidth,
                    color =
                        if (added) {
                            PickerColors.Emerald500.copy(alpha = 0.40f)
                        } else {
                            PickerColors.Violet500.copy(alpha = 0.40f)
                        },
                    shape = shape,
                )
                .toggleable(
                    value = added,
                    enabled = enabled && !pending,
                    role = Role.Button,
                    onValueChange = { onToggle() },
                )
                .testTag("services-row-action")
                .padding(horizontal = PickerMetrics.rowActionHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (added) {
            Icon(
                imageVector = LucideVectors.Check,
                contentDescription = null,
                tint = PickerColors.Emerald300,
                modifier = Modifier.size(PickerMetrics.checkSize),
            )
            Spacer(Modifier.size(PickerMetrics.actionGap))
        }
        Text(
            text = labelOf(state),
            style =
                MaterialTheme.typography.labelSmall.copy(
                    fontSize = PickerMetrics.rowActionTextSize,
                    fontWeight = FontWeight.Bold,
                ),
            color = if (added) PickerColors.Emerald300 else PickerColors.Violet200,
            maxLines = 1,
        )
    }
}

/** Add / remove, in the site's words. */
private fun labelOf(state: PickerRowState): String =
    when (state) {
        PickerRowState.Add -> ServicesSheetCopy.ADD
        PickerRowState.Remove -> ServicesSheetCopy.REMOVE
    }

/** A hairline under every row but the last, as the site's `border-b` draws. */
private fun Modifier.bottomHairline(last: Boolean): Modifier =
    if (last) {
        this
    } else {
        drawBehind {
            drawRect(
                color = PickerColors.Divider.copy(alpha = 0.6f),
                topLeft = Offset(0f, size.height - 1f),
                size = Size(size.width, 1f),
            )
        }
    }
