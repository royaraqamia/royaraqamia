package com.royaraqamia.app.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.shell.ServicesEntry
import com.royaraqamia.app.shell.iconOf
import com.royaraqamia.app.shell.labelOf
import com.royaraqamia.app.ui.vectors.LucideVectors

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
 * The strip is the order the account or device stored — add order, no cap — and
 * each pill is a tab, not a link: on the site the homepage hosts every app under
 * the strip. The app opens a tab's own route in the document, which is why the
 * strip is drawn here without a surface under it yet.
 *
 * The page's numbers are the contract's (`shared/visual/home.json`): a 10dp gap
 * between pills, 44dp pills with a 16dp inline inset, and the end control that
 * opens the same picker the top bar does. The new-app control's dashed border is
 * the one shape Compose does not provide, so it is drawn with a dash path rather
 * than faked with a solid line.
 */
@Composable
fun HomeTabStrip(
    order: List<String>,
    selected: String?,
    onSelect: (String) -> Unit,
    onAddApp: () -> Unit,
    modifier: Modifier = Modifier,
) {
    // The member's order, not the catalogue's: the page maps the stored routes
    // through the catalogue (`order.map(BY_ROUTE)`), so the strip's first pill is
    // the first app the member kept rather than the first app the site ships.
    val byRoute = ServicesEntry.rows.associateBy { it.route }
    val entries = order.mapNotNull { byRoute[it] }

    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .padding(
                    start = HomeStripMetrics.horizontalPadding,
                    end = HomeStripMetrics.horizontalPadding,
                    top = HomeStripMetrics.topPadding,
                )
                .semantics { contentDescription = HomeStripCopy.STRIP_LABEL }
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(vertical = HomeStripMetrics.rowVerticalPadding)
                    .testTag("home-app-strip"),
            horizontalArrangement = Arrangement.spacedBy(HomeStripMetrics.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            entries.forEach { entry ->
                StripPill(
                    entry = entry,
                    active = entry.route == selected,
                    onClick = { onSelect(entry.route) },
                )
            }
            NewAppPill(onClick = onAddApp)
        }
    }
}

@Composable
private fun StripPill(entry: ServicesEntry, active: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(HomeStripMetrics.pillRadius)
    Row(
        modifier =
            Modifier.heightIn(min = HomeStripMetrics.pillMinHeight)
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

/** The site's dashed "new app" pill, which opens the picker. */
@Composable
private fun NewAppPill(onClick: () -> Unit) {
    Row(
        modifier =
            Modifier.heightIn(min = HomeStripMetrics.pillMinHeight)
                .clip(RoundedCornerShape(HomeStripMetrics.pillRadius))
                .clickable(onClick = onClick)
                .testTag("home-new-app")
                .dashedPillBorder(StripColors.Neutral700)
                .padding(HomeStripMetrics.borderWidth)
                .padding(horizontal = HomeStripMetrics.pillHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = LucideVectors.Plus,
            contentDescription = null,
            tint = StripColors.Neutral400,
            modifier = Modifier.size(HomeStripMetrics.iconSize),
        )
        Text(
            text = HomeStripCopy.NEW_APP,
            style =
                MaterialTheme.typography.bodyMedium.copy(
                    fontSize = HomeStripMetrics.pillTextSize,
                    fontWeight = HomeStripMetrics.pillWeight,
                ),
            color = StripColors.Neutral400,
            maxLines = 1,
        )
    }
}

/** `border-dashed` on a fully rounded pill, to the page's 1dp line. */
private fun Modifier.dashedPillBorder(color: Color): Modifier =
    drawBehind {
        val line = 1.dp.toPx()
        val inset = line / 2f
        val radius = (size.height / 2f) - inset
        val path =
            Path().apply {
                addRoundRect(
                    RoundRect(
                        rect = Rect(inset, inset, size.width - inset, size.height - inset),
                        topLeft = CornerRadius(radius),
                        topRight = CornerRadius(radius),
                        bottomRight = CornerRadius(radius),
                        bottomLeft = CornerRadius(radius),
                    )
                )
            }
        drawPath(
            path = path,
            color = color,
            style =
                Stroke(
                    width = line,
                    pathEffect =
                        PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 3.dp.toPx())),
                ),
        )
    }
