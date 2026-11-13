package com.royaraqamia.app.athkar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The Athkar reader, as the site's `/athkar` and `/athkar/evening` draw it
 * (#1389).
 *
 * The text is the site's own vendored copy, set in the same faces and spacing:
 * the heading's gradient, the two sitting chips, the card's 24dp corner and its
 * 18sp/36sp reading column, the daily counter and the source line, and the
 * virtue the narration gives. The page is static; the only state is today's
 * count, which lives on the device like the page's `localStorage` record.
 *
 * The screen reads [collections] and [counts] and nothing else, so a test can
 * hand it the same values the route reads from the APK's assets.
 */
@Composable
fun AthkarScreen(
    collections: Map<AthkarPeriod, AthkarCollection>,
    period: AthkarPeriod,
    counts: AthkarCounts,
    ready: Boolean,
    onSelectPeriod: (AthkarPeriod) -> Unit,
    onIncrement: (AthkarPeriod, String, Int) -> Unit,
    onReset: (AthkarPeriod, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val collection = collections[period] ?: return

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = AthkarMetrics.horizontalPadding)
                .padding(top = AthkarMetrics.topPadding, bottom = AthkarMetrics.bottomPadding),
    ) {
        Box(
            modifier = Modifier.fillMaxWidth().height(AthkarMetrics.titleHeight).testTag(AthkarMetrics.TITLE),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = AthkarPageCopy.PAGE_TITLE,
                modifier = Modifier.padding(vertical = AthkarMetrics.titleVerticalPadding).semantics { heading() },
                style =
                    TextStyle(
                        fontSize = AthkarMetrics.titleSize,
                        lineHeight = AthkarMetrics.titleLineHeight,
                        fontWeight = AthkarMetrics.titleWeight,
                        letterSpacing = AthkarMetrics.titleTracking,
                        textAlign = TextAlign.Center,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    AthkarMetrics.titleStart,
                                    AthkarMetrics.titleMiddle,
                                    AthkarMetrics.titleEnd,
                                )
                            ),
                    ),
            )
        }

        Spacer(Modifier.height(AthkarMetrics.titleToTabs))

        PeriodTabs(
            collections = collections,
            period = period,
            onSelectPeriod = onSelectPeriod,
        )

        Spacer(Modifier.height(AthkarMetrics.tabsToPanel))

        Column(
            modifier = Modifier.fillMaxWidth().testTag(AthkarMetrics.LIST),
            verticalArrangement = Arrangement.spacedBy(AthkarMetrics.listGap),
        ) {
            collection.items.forEachIndexed { index, item ->
                val count = counts.countFor(period, item.id, item.repeat)
                AthkarCard(
                    item = item,
                    index = index,
                    count = count,
                    ready = ready,
                    onIncrement = { onIncrement(period, item.id, item.repeat) },
                    onReset = { onReset(period, item.id) },
                )
            }
        }
    }
}

@Composable
private fun PeriodTabs(
    collections: Map<AthkarPeriod, AthkarCollection>,
    period: AthkarPeriod,
    onSelectPeriod: (AthkarPeriod) -> Unit,
) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        Row(
            modifier =
                Modifier.testTag(AthkarMetrics.TABS)
                    .selectableGroup()
                    .semantics { contentDescription = AthkarPageCopy.PERIOD_LABEL }
                    .padding(horizontal = AthkarMetrics.tabsPaddingHorizontal)
                    .padding(bottom = AthkarMetrics.tabsPaddingBottom),
            horizontalArrangement = Arrangement.spacedBy(AthkarMetrics.tabsGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AthkarPeriod.entries.forEachIndexed { index, option ->
                val active = option == period
                val label = collections[option]?.title.orEmpty()
                val shape = RoundedCornerShape(percent = 50)
                Box(
                    modifier =
                        Modifier.height(AthkarMetrics.tabHeight)
                            .testTag(AthkarMetrics.tabTag(index))
                            .clip(shape)
                            .background(if (active) RoyColors.foreground else Color.Transparent)
                            .border(
                                AthkarMetrics.borderWidth,
                                if (active) Color.Transparent else RoyColors.border.copy(alpha = 0.6f),
                                shape,
                            )
                            .selectable(selected = active, role = Role.Tab) { onSelectPeriod(option) }
                            .padding(horizontal = AthkarMetrics.tabPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = label,
                        color = if (active) RoyColors.background else RoyColors.mutedForeground,
                        fontSize = AthkarMetrics.tabTextSize,
                        lineHeight = AthkarMetrics.tabLineHeight,
                        fontWeight = AthkarMetrics.tabWeight,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

@Composable
private fun AthkarCard(
    item: AthkarItem,
    index: Int,
    count: Int,
    ready: Boolean,
    onIncrement: () -> Unit,
    onReset: () -> Unit,
) {
    val complete = ready && count >= item.repeat
    val shape = RoundedCornerShape(AthkarMetrics.cardRadius)

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(AthkarMetrics.cardTag(index))
                .clip(shape)
                .background(
                    if (complete) AthkarMetrics.completeSurface
                    else RoyColors.card.copy(alpha = 0.6f)
                )
                .border(
                    AthkarMetrics.borderWidth,
                    if (complete) AthkarMetrics.completeBorder
                    else RoyColors.border.copy(alpha = 0.7f),
                    shape,
                )
                // The site's border is inside the card's box (`border-box`), so
                // the 1dp the border paints without consuming is added back as
                // padding for the measured boxes to line up.
                .padding(AthkarMetrics.borderWidth)
                .padding(AthkarMetrics.cardPadding),
    ) {
        Text(
            text = item.text,
            modifier = Modifier.testTag(AthkarMetrics.textTag(index)),
            color = RoyColors.foreground,
            fontSize = AthkarMetrics.textSize,
            lineHeight = AthkarMetrics.textLineHeight,
        )

        Spacer(Modifier.height(AthkarMetrics.counterMarginTop))

        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(AthkarMetrics.borderWidth)
                    .background(RoyColors.border.copy(alpha = 0.6f))
        )

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = AthkarMetrics.counterPaddingTop),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(AthkarMetrics.counterGap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CountButton(
                    count = count,
                    repeat = item.repeat,
                    ready = ready,
                    complete = complete,
                    index = index,
                    onClick = onIncrement,
                )
                if (ready && count > 0) {
                    Text(
                        text = AthkarCopy.RESET_COUNT,
                        modifier =
                            Modifier.clickable(role = Role.Button, onClick = onReset)
                                .padding(vertical = 4.dp)
                                .semantics {
                                    contentDescription =
                                        AthkarCopy.RESET_LABEL.replace("{index}", (index + 1).toString())
                                },
                        color = RoyColors.mutedForeground,
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Source(item = item, index = index)
        }

        if (item.virtue != null) {
            Virtue(item = item, index = index)
        }
    }
}

@Composable
private fun CountButton(
    count: Int,
    repeat: Int,
    ready: Boolean,
    complete: Boolean,
    index: Int,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(percent = 50)
    val label =
        if (ready) {
            AthkarCopy.COUNT_OF
                .replace("{count}", count.toString())
                .replace("{repeat}", repeat.toString())
        } else {
            AthkarCopy.COUNT_PENDING.replace("{repeat}", repeat.toString())
        }
    val tint = if (complete) AthkarMetrics.completeText else RoyColors.primary

    Row(
        modifier =
            Modifier.height(AthkarMetrics.countHeight)
                .testTag(AthkarMetrics.countTag(index))
                .semantics {
                    contentDescription = AthkarCopy.COUNT_LABEL.replace("{index}", (index + 1).toString())
                    role = Role.Button
                }
                .clip(shape)
                .background(
                    if (complete) AthkarMetrics.completeSurface
                    else RoyColors.primary.copy(alpha = 0.1f)
                )
                .border(
                    AthkarMetrics.borderWidth,
                    if (complete) AthkarMetrics.completeBorder
                    else RoyColors.primary.copy(alpha = 0.4f),
                    shape,
                )
                .clickable(enabled = ready && !complete, onClick = onClick)
                .padding(horizontal = AthkarMetrics.countPadding),
        horizontalArrangement = Arrangement.spacedBy(AthkarMetrics.countGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (complete) LucideVectors.Check else LucideVectors.Plus,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(AthkarMetrics.countIcon),
        )
        Text(
            text = label,
            color = tint,
            fontFamily = RoyFonts.digits,
            fontSize = AthkarMetrics.countTextSize,
            lineHeight = AthkarMetrics.countLineHeight,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun Source(item: AthkarItem, index: Int) {
    // The site's line box is exactly the 12/16 step; Compose adds the face's
    // own ascent and descent on top of `lineHeight`, so the box is pinned to the
    // number the page records.
    Box(
        modifier = Modifier.height(AthkarMetrics.sourceBoxHeight).testTag(AthkarMetrics.sourceTag(index)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text =
                buildAnnotatedString {
                    withStyle(SpanStyle(color = RoyColors.foreground.copy(alpha = 0.6f))) {
                        append(AthkarCopy.SOURCE_LABEL)
                    }
                    append("${item.source.label} ${item.source.ref}")
                },
            color = RoyColors.mutedForeground,
            fontSize = AthkarMetrics.sourceTextSize,
            lineHeight = AthkarMetrics.sourceLineHeight,
        )
    }
}

@Composable
private fun Virtue(item: AthkarItem, index: Int) {
    var open by remember(item.id) { mutableStateOf(false) }

    Spacer(Modifier.height(AthkarMetrics.virtueMarginTop))

    Column(modifier = Modifier.fillMaxWidth()) {
        // The closed summary is the page's 20dp line exactly; Compose's face
        // padding would otherwise make the card a pixel and a half too tall.
        Box(
            modifier =
                Modifier.height(AthkarMetrics.virtueSummaryHeight)
                    .clickable(role = Role.Button) { open = !open },
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = AthkarCopy.VIRTUE,
                color = RoyColors.foreground.copy(alpha = 0.7f),
                fontSize = AthkarMetrics.virtueSummarySize,
                lineHeight = AthkarMetrics.virtueSummaryLineHeight,
                fontWeight = FontWeight.Medium,
            )
        }
        if (open) {
            Text(
                text = item.virtue.orEmpty(),
                modifier = Modifier.padding(top = AthkarMetrics.virtueBodyGap),
                color = RoyColors.mutedForeground,
                fontSize = AthkarMetrics.virtueBodySize,
                lineHeight = AthkarMetrics.virtueBodyLineHeight,
            )
        }
    }
}

/** The page's numbers at 393 x 852, and the test tags that name them. */
internal object AthkarMetrics {
    const val TITLE = "athkar-title"
    const val TABS = "athkar-tabs"
    const val LIST = "athkar-list"

    fun tabTag(index: Int) = "athkar-tab-$index"

    fun cardTag(index: Int) = "athkar-card-$index"

    fun textTag(index: Int) = "athkar-text-$index"

    fun countTag(index: Int) = "athkar-count-$index"

    fun sourceTag(index: Int) = "athkar-source-$index"

    val horizontalPadding = 16.dp
    val topPadding = 24.dp
    val bottomPadding = 112.dp
    val borderWidth = 1.dp

    val titleSize = 30.sp
    val titleLineHeight = 34.5.sp
    val titleVerticalPadding = 4.5.dp
    val titleHeight = 43.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleToTabs = 32.dp
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)

    val tabsGap = 8.dp
    val tabsPaddingHorizontal = 4.dp
    val tabsPaddingBottom = 4.dp
    val tabHeight = 40.dp
    val tabPadding = 16.dp
    val tabTextSize = 14.sp
    val tabLineHeight = 20.sp
    val tabWeight = FontWeight.Bold
    val tabsToPanel = 24.dp

    val listGap = 16.dp
    val cardRadius = 24.dp
    val cardPadding = 20.dp
    val textSize = 18.sp
    val textLineHeight = 36.sp

    val counterMarginTop = 20.dp
    val counterPaddingTop = 16.dp
    val counterGap = 12.dp
    val countHeight = 44.dp
    val countPadding = 17.dp
    val countGap = 8.dp
    val countIcon = 16.dp
    val countTextSize = 14.sp
    val countLineHeight = 20.sp

    val sourceTextSize = 12.sp
    val sourceLineHeight = 16.sp
    val sourceBoxHeight = 16.dp

    val virtueMarginTop = 12.dp
    val virtueSummarySize = 14.sp
    val virtueSummaryLineHeight = 20.sp
    val virtueSummaryHeight = 20.dp
    val virtueBodyGap = 8.dp
    val virtueBodySize = 14.sp
    val virtueBodyLineHeight = 22.75.sp

    val completeSurface = Color(0xFF10B981).copy(alpha = 0.05f)
    val completeBorder = Color(0xFF10B981).copy(alpha = 0.4f)
    val completeText = Color(0xFF6EE7B7)
}
