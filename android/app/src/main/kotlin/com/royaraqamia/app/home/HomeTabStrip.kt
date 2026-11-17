package com.royaraqamia.app.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.shell.ServicesEntry
import com.royaraqamia.app.shell.iconOf
import com.royaraqamia.app.shell.labelOf
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlin.math.roundToInt

/** The strip's page numbers, read from its classes (ADR-0118). */
internal object HomeStripMetrics {
    val horizontalPadding = 16.dp
    val topPadding = 24.dp
    val rowVerticalPadding = 8.dp
    val gap = 10.dp
    val pillMinHeight = 44.dp
    val pillHorizontalPadding = 16.dp
    val pillGap = 8.dp
    val pillRadius = 50
    val pillTextSize = 14.sp
    val pillWeight = FontWeight.Bold
    val iconSize = 16.dp
    val borderWidth = 1.dp
}

/** The strip's palette, from the site's Tailwind classes. */
private object StripColors {
    val Violet200 = Color(0xFFDDD6FE)
    val Violet300 = Color(0xFFC4B5FD)
    val Violet500 = Color(0xFF8B5CF6)
    val Violet600 = Color(0xFF7C3AED)
    val Neutral200 = Color(0xFFE5E5E5)
    val Neutral400 = Color(0xFFA3A3A3)
    val Neutral700 = Color(0xFF404040)
    val Neutral800 = Color(0xFF262626)
    val Neutral900 = Color(0xFF171717)
}

/**
 * The apps a member keeps, as a horizontally scrolling strip (#1194, ADR-0146).
 *
 * The strip is the order the account or device stored — add order, until the
 * member rearranges it (ADR-0202) — and each pill is a tab, not a link: on the
 * site the homepage hosts every app under the strip. The app opens a tab's own
 * route in the document, which is why the strip is drawn here without a surface
 * under it yet.
 *
 * The page's numbers are the contract's (`shared/visual/home.json`): a 10dp gap
 * between pills and 44dp pills with a 16dp inline inset. The picker is the top
 * bar's door, so the row is the tabs and the arrange toggle and nothing else.
 *
 * «ترتيب» is the only way into the drag, exactly as on the site: the pills are
 * draggable only in that mode, so a tap still selects and a flick still scrolls.
 * The drag reorders the local draft as it crosses a slot and hands the whole list
 * to [onReorder] once, on release; the controller serialises the write.
 */
@Composable
fun HomeTabStrip(
    order: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
    arranging: Boolean = false,
    onToggleArrange: () -> Unit = {},
    onReorder: (List<String>) -> Unit = {},
) {
    // The member's order, not the catalogue's: the page maps the stored routes
    // through the catalogue (`order.map(BY_ROUTE)`), so the strip's first pill is
    // the first app the member kept rather than the first app the site ships.
    val byRoute = ServicesEntry.rows.associateBy { it.route }
    var draft by remember { mutableStateOf(order) }
    var dragged by remember { mutableStateOf<String?>(null) }
    var dragDx by remember { mutableFloatStateOf(0f) }
    var status by remember { mutableStateOf("") }

    LaunchedEffect(order) {
        if (dragged == null) draft = order
    }
    LaunchedEffect(arranging) {
        if (arranging) draft = order
    }

    val entries = (if (arranging) draft else order).mapNotNull { byRoute[it] }
    val gapPx = with(LocalDensity.current) { HomeStripMetrics.gap.toPx() }

    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(
                    start = HomeStripMetrics.horizontalPadding,
                    end = HomeStripMetrics.horizontalPadding,
                    top = HomeStripMetrics.topPadding,
                )
                .semantics {
                    contentDescription = HomeStripCopy.STRIP_LABEL
                    if (status.isNotEmpty()) stateDescription = status
                }
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .horizontalScroll(rememberScrollState(), enabled = !arranging)
                    .padding(vertical = HomeStripMetrics.rowVerticalPadding)
                    .testTag("home-app-strip"),
            horizontalArrangement = Arrangement.spacedBy(HomeStripMetrics.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            entries.forEach { entry ->
                StripPill(
                    entry = entry,
                    active = entry.route == selected,
                    onClick = {
                        onSelect(entry.route)
                        if (arranging) onToggleArrange()
                    },
                    arranging = arranging,
                    dragging = dragged == entry.route,
                    onDragStart = {
                        dragged = entry.route
                        dragDx = 0f
                        status = ""
                    },
                    onDrag = { dx, widthPx ->
                        val from = draft.indexOf(entry.route)
                        val step = widthPx + gapPx
                        if (from != -1 && step > 0f) {
                            dragDx += dx
                            val to =
                                (from + (dragDx / step).roundToInt()).coerceIn(0, draft.lastIndex)
                            if (to != from) {
                                draft = draft.toMutableList().apply { add(to, removeAt(from)) }
                                dragDx -= (to - from) * step
                            }
                        }
                    },
                    onDragEnd = {
                        dragged = null
                        dragDx = 0f
                        val position = draft.indexOf(entry.route)
                        if (position != -1) {
                            status = movedSentence(labelOf(entry), position + 1, draft.size)
                        }
                        if (draft != order) onReorder(draft)
                    },
                )
            }
            ArrangePill(arranging = arranging, onClick = onToggleArrange)
        }
    }
}

/** The site's words for a move, with the placeholders the copy source declares. */
private fun movedSentence(label: String, position: Int, count: Int): String =
    HomeStripCopy.MOVED
        .replace("{name}", label)
        .replace("{position}", position.toString())
        .replace("{count}", count.toString())

@Composable
private fun StripPill(
    entry: ServicesEntry,
    active: Boolean,
    onClick: () -> Unit,
    arranging: Boolean = false,
    dragging: Boolean = false,
    onDragStart: () -> Unit = {},
    onDrag: (dx: Float, widthPx: Float) -> Unit = { _, _ -> },
    onDragEnd: () -> Unit = {},
) {
    val shape = RoundedCornerShape(HomeStripMetrics.pillRadius)
    var widthPx by remember { mutableFloatStateOf(0f) }

    Row(
        modifier =
            Modifier.heightIn(min = HomeStripMetrics.pillMinHeight)
                .onGloballyPositioned { widthPx = it.size.width.toFloat() }
                .clip(shape)
                .background(
                    if (active) {
                        StripColors.Violet600.copy(alpha = 0.20f)
                    } else {
                        StripColors.Neutral900.copy(alpha = 0.70f)
                    }
                )
                .border(
                    width = HomeStripMetrics.borderWidth,
                    color =
                        if (active) {
                            StripColors.Violet500.copy(alpha = 0.60f)
                        } else {
                            StripColors.Neutral800
                        },
                    shape = shape,
                )
                .alpha(if (dragging) 0.70f else 1f)
                .then(
                    if (arranging) {
                        Modifier.pointerInput(entry.route) {
                            // The strip scrolls on the same axis the drag travels
                            // (ADR-0202's amendment): a pill lifts only after a
                            // hold, so a flick before it still scrolls the row.
                            detectDragGesturesAfterLongPress(
                                onDragStart = { onDragStart() },
                                onDragEnd = { onDragEnd() },
                                onDragCancel = { onDragEnd() },
                            ) { change, amount ->
                                change.consume()
                                onDrag(amount.x, widthPx)
                            }
                        }
                    } else {
                        Modifier
                    }
                )
                .selectable(selected = active, role = Role.Tab, onClick = onClick)
                // `border-box`: the page's 1px border eats into the pill, so the
                // content starts one pixel inside the padding rather than under it.
                .padding(HomeStripMetrics.borderWidth)
                .padding(horizontal = HomeStripMetrics.pillHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(HomeStripMetrics.pillGap),
    ) {
        Icon(
            imageVector = iconOf(entry),
            contentDescription = null,
            tint = StripColors.Violet300,
            modifier = Modifier.size(HomeStripMetrics.iconSize),
        )
        Text(
            text = labelOf(entry),
            style =
                MaterialTheme.typography.bodyMedium.copy(
                    fontSize = HomeStripMetrics.pillTextSize,
                    fontWeight = HomeStripMetrics.pillWeight,
                ),
            color = if (active) StripColors.Violet200 else StripColors.Neutral200,
            maxLines = 1,
        )
    }
}

/** The site's «ترتيب»/«تم» toggle; the only way into the drag. */
@Composable
private fun ArrangePill(arranging: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(HomeStripMetrics.pillRadius)
    Row(
        modifier =
            Modifier.heightIn(min = HomeStripMetrics.pillMinHeight)
                .clip(shape)
                .background(
                    if (arranging) {
                        StripColors.Violet600.copy(alpha = 0.20f)
                    } else {
                        StripColors.Neutral900.copy(alpha = 0.70f)
                    }
                )
                .border(
                    width = HomeStripMetrics.borderWidth,
                    color = if (arranging) StripColors.Violet500.copy(alpha = 0.60f) else StripColors.Neutral800,
                    shape = shape,
                )
                .clickable(onClick = onClick)
                .testTag("home-arrange")
                .padding(HomeStripMetrics.borderWidth)
                .padding(horizontal = HomeStripMetrics.pillHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(HomeStripMetrics.pillGap),
    ) {
        Icon(
            imageVector = LucideVectors.ArrowUpDown,
            contentDescription = null,
            tint = if (arranging) StripColors.Violet200 else StripColors.Neutral400,
            modifier = Modifier.size(HomeStripMetrics.iconSize),
        )
        Text(
            text = if (arranging) HomeStripCopy.DONE else HomeStripCopy.ARRANGE,
            style =
                MaterialTheme.typography.bodyMedium.copy(
                    fontSize = HomeStripMetrics.pillTextSize,
                    fontWeight = HomeStripMetrics.pillWeight,
                ),
            color = if (arranging) StripColors.Violet200 else StripColors.Neutral400,
            maxLines = 1,
        )
    }
}
