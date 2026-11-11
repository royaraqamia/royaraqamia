package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalytics
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The owned link's analytics drawer (#962), ported from
 * `frontend/ui/linksnap/link-analytics-content.tsx`.
 *
 * The page draws the drawer under a row: three range presets, the click total,
 * the top referrer, the link status, the device, OS and browser breakdowns with
 * their empty sentences, the top referrers and the recent-activity rows. The
 * chart (#963) and the CSV export (#964) are the next slices and are not drawn
 * here; every visible word is [LinksnapAnalyticsCopy], generated from the same
 * source the page reads (ADR-0098).
 *
 * The four faces are [LinksnapAnalyticsUiState]: the skeleton while the read
 * runs, the sentence a device with the radio off gets instead of zeroes, the
 * refusal when the server answers, and the filled blocks.
 */
@Composable
internal fun LinksnapAnalyticsDrawer(
    state: LinksnapAnalyticsUiState,
    status: String,
    range: LinksnapAnalyticsRange,
    onRange: (LinksnapAnalyticsRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .background(LinksnapAnalyticsMetrics.surface)
                .padding(LinksnapAnalyticsMetrics.drawerPadding),
        verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.sectionGap),
    ) {
        LinksnapAnalyticsContent(state = state, status = status, range = range, onRange = onRange)
    }
}

/** The three range presets the page offers, and the window each asks for. */
internal enum class LinksnapAnalyticsRange(val days: Long) {
    Last7Days(7),
    Last30Days(30),
    Last90Days(90),
    ;

    val label: String
        get() =
            when (this) {
                Last7Days -> LinksnapAnalyticsCopy.RANGE7
                Last30Days -> LinksnapAnalyticsCopy.RANGE30
                Last90Days -> LinksnapAnalyticsCopy.RANGE90
            }
}

/**
 * The drawer without its shell, so the visual gate can draw it without a client
 * (#874, ADR-0118). The `analytics` state measures the presets group and its
 * three buttons; the raster is that group, which is the part whose type and
 * colours the contract does not name.
 */
@Composable
internal fun LinksnapAnalyticsContent(
    state: LinksnapAnalyticsUiState,
    status: String,
    range: LinksnapAnalyticsRange,
    onRange: (LinksnapAnalyticsRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        LinksnapAnalyticsUiState.Loading ->
            Column(modifier, verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.sectionGap)) {
                Text(
                    text = LinksnapAnalyticsCopy.LOADING,
                    style =
                        TextStyle(
                            fontSize = LinksnapAnalyticsMetrics.bodySize,
                            color = RoyColors.mutedForeground,
                        ),
                )
                repeat(3) {
                    Box(
                        Modifier.fillMaxWidth()
                            .height(LinksnapAnalyticsMetrics.skeletonHeight)
                            .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.cardRadius))
                            .background(LinksnapAnalyticsMetrics.skeleton),
                    )
                }
            }

        LinksnapAnalyticsUiState.Offline ->
            AnalyticsNotice(
                modifier = modifier,
                message = LinksnapAnalyticsCopy.OFFLINE,
            )

        is LinksnapAnalyticsUiState.Failed ->
            AnalyticsNotice(
                modifier = modifier,
                message = "${LinksnapAnalyticsCopy.FAILED} ${state.message}",
            )

        is LinksnapAnalyticsUiState.Ready ->
            LinksnapAnalyticsReady(
                summary = state.summary,
                status = status,
                range = range,
                onRange = onRange,
                modifier = modifier,
            )
    }
}

@Composable
private fun AnalyticsNotice(modifier: Modifier, message: String) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.noticeRadius))
                .background(LinksnapAnalyticsMetrics.noticeSurface)
                .border(
                    1.dp,
                    LinksnapAnalyticsMetrics.noticeBorder,
                    RoundedCornerShape(LinksnapAnalyticsMetrics.noticeRadius),
                )
                .padding(LinksnapAnalyticsMetrics.noticePadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.inlineGap),
    ) {
        Icon(
            imageVector = LucideVectors.AlertTriangle,
            contentDescription = null,
            modifier = Modifier.size(LinksnapAnalyticsMetrics.noticeIcon),
            tint = RoyColors.destructive,
        )
        Text(
            text = message,
            style =
                TextStyle(
                    fontSize = LinksnapAnalyticsMetrics.bodySize,
                    lineHeight = LinksnapAnalyticsMetrics.bodyLineHeight,
                    color = RoyColors.destructive,
                ),
        )
    }
}

@Composable
private fun LinksnapAnalyticsReady(
    summary: LinksnapAnalyticsResponseAnalytics,
    status: String,
    range: LinksnapAnalyticsRange,
    onRange: (LinksnapAnalyticsRange) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.sectionGap),
    ) {
        RangePresets(range = range, onRange = onRange)

        Column(verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.cardGap)) {
            Row(horizontalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.cardGap)) {
                SummaryCard(
                    label = LinksnapAnalyticsCopy.TOTAL_CLICKS,
                    value = summary.totalClicks.toString(),
                    valueStyle = LinksnapAnalyticsMetrics.metricValueStyle,
                    modifier = Modifier.weight(1f),
                )
                SummaryCard(
                    label = LinksnapAnalyticsCopy.TOP_REFERRER,
                    value =
                        summary.topReferrers.firstOrNull()?.name
                            ?: LinksnapAnalyticsCopy.DIRECT_UNKNOWN,
                    valueStyle = LinksnapAnalyticsMetrics.referrerValueStyle,
                    modifier = Modifier.weight(1f),
                )
            }

            SummaryCard(
                label = LinksnapAnalyticsCopy.LINK_STATUS,
                value = "",
                valueStyle = LinksnapAnalyticsMetrics.referrerValueStyle,
                trailing = { StatusPill(status) },
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.cardGap)) {
            BreakdownCard(
                icon = LucideVectors.Cpu,
                title = LinksnapAnalyticsCopy.DEVICES,
                rows = summary.device.devices.map { it.name to it.count },
                percents = summary.device.devices.map { it.percent },
                total = summary.totalClicks,
                emptyLabel = LinksnapAnalyticsCopy.EMPTY_DEVICES,
            )
            BreakdownCard(
                icon = LucideVectors.Globe,
                title = LinksnapAnalyticsCopy.OS,
                rows = summary.device.os.map { it.name to it.count },
                percents = summary.device.os.map { it.percent },
                total = summary.totalClicks,
                emptyLabel = LinksnapAnalyticsCopy.EMPTY_OS,
            )
            BreakdownCard(
                icon = LucideVectors.Monitor,
                title = LinksnapAnalyticsCopy.BROWSERS,
                rows = summary.device.browsers.map { it.name to it.count },
                percents = summary.device.browsers.map { it.percent },
                total = summary.totalClicks,
                emptyLabel = LinksnapAnalyticsCopy.EMPTY_BROWSERS,
            )
        }

        Column(verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.sectionGap)) {
            ReferrersCard(summary.topReferrers.map { it.name to it.count })
            ActivityCard(summary.recentClicks.map { it.userAgent to it.clickedAt })
        }

        // The click chart (#963), the page's last block in the drawer. An empty
        // period keeps the page's dashed sentence rather than an empty box.
        LinksnapAnalyticsChart(
            state =
                if (summary.clicksByDate.isEmpty()) {
                    LinksnapAnalyticsChartUiState.Empty
                } else {
                    LinksnapAnalyticsChartUiState.Ready(summary.clicksByDate)
                }
        )
    }
}

@Composable
private fun RangePresets(
    range: LinksnapAnalyticsRange,
    onRange: (LinksnapAnalyticsRange) -> Unit,
) {
    Row(
        modifier =
            Modifier.testTag(LinksnapAnalyticsMetrics.PRESETS)
                .semantics { contentDescription = LinksnapAnalyticsCopy.RANGE_LABEL }
                .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.presetsRadius))
                .background(LinksnapAnalyticsMetrics.presetsSurface)
                .padding(LinksnapAnalyticsMetrics.presetsPadding),
        horizontalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.presetGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        LinksnapAnalyticsRange.entries.forEach { preset ->
            val selected = preset == range
            Box(
                modifier =
                    Modifier.testTag(LinksnapAnalyticsMetrics.presetTag(preset))
                        .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.presetRadius))
                        .background(
                            if (selected) RoyColors.selected else Color.Transparent
                        )
                        .clickable(role = Role.Button) { onRange(preset) }
                        .padding(
                            horizontal = LinksnapAnalyticsMetrics.presetPaddingX,
                            vertical = LinksnapAnalyticsMetrics.presetPaddingY,
                        ),
            ) {
                Text(
                    text = preset.label,
                    style =
                        TextStyle(
                            fontSize = LinksnapAnalyticsMetrics.presetSize,
                            lineHeight = LinksnapAnalyticsMetrics.presetLineHeight,
                            fontWeight = FontWeight.Bold,
                            color =
                                if (selected) RoyColors.selectedForeground
                                else RoyColors.mutedForeground,
                        ),
                )
            }
        }
    }
}

@Composable
private fun SummaryCard(
    label: String,
    value: String,
    valueStyle: TextStyle,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier =
            modifier
                .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.cardRadius))
                .background(RoyColors.card)
                .border(
                    1.dp,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapAnalyticsMetrics.cardRadius),
                )
                .padding(LinksnapAnalyticsMetrics.cardPadding),
        verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.cardLabelGap),
    ) {
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = LinksnapAnalyticsMetrics.labelSize,
                    lineHeight = LinksnapAnalyticsMetrics.labelLineHeight,
                    fontWeight = FontWeight.Bold,
                    color = RoyColors.mutedForeground,
                ),
        )
        if (trailing != null) {
            trailing()
        } else {
            Text(
                text = value,
                style = valueStyle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun StatusPill(status: String) {
    val (label, tone) =
        when (status) {
            "blocked" -> LinksnapAnalyticsCopy.STATUS_BLOCKED to LinksnapAnalyticsMetrics.blocked
            "expired" -> LinksnapAnalyticsCopy.STATUS_EXPIRED to LinksnapAnalyticsMetrics.expired
            else -> LinksnapAnalyticsCopy.STATUS_ACTIVE to LinksnapAnalyticsMetrics.active
        }
    Row(
        modifier =
            Modifier.clip(CircleShape)
                .background(tone.surface)
                .border(1.dp, tone.border, CircleShape)
                .padding(
                    horizontal = LinksnapAnalyticsMetrics.pillPaddingX,
                    vertical = LinksnapAnalyticsMetrics.pillPaddingY,
                ),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(
            Modifier.size(6.dp)
                .clip(CircleShape)
                .background(tone.dot)
        )
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = LinksnapAnalyticsMetrics.bodySize,
                    lineHeight = LinksnapAnalyticsMetrics.bodyLineHeight,
                    fontWeight = FontWeight.Bold,
                    color = tone.content,
                ),
        )
    }
}

@Composable
private fun BreakdownCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    rows: List<Pair<String, Long>>,
    percents: List<Long>,
    total: Long,
    emptyLabel: String,
) {
    Card(title = title, icon = icon) {
        if (rows.isEmpty()) {
            EmptySentence(emptyLabel)
        } else {
            rows.forEachIndexed { index, (name, count) ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = name,
                            style = LinksnapAnalyticsMetrics.rowStyle,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = "$count · ${percents.getOrElse(index) { 0 }}%",
                            style = LinksnapAnalyticsMetrics.rowMonoStyle,
                        )
                    }
                    Box(
                        Modifier.fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape)
                            .background(LinksnapAnalyticsMetrics.track),
                    ) {
                        val fraction =
                            if (total > 0) count.toFloat() / total.toFloat() else 0f
                        Box(
                            Modifier.fillMaxWidth(fraction)
                                .height(6.dp)
                                .clip(CircleShape)
                                .background(LinksnapAnalyticsMetrics.bar),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReferrersCard(rows: List<Pair<String, Long>>) {
    Card(title = LinksnapAnalyticsCopy.TOP_REFERRERS, icon = LucideVectors.Globe) {
        if (rows.isEmpty()) {
            EmptySentence(LinksnapAnalyticsCopy.EMPTY_REFERRERS)
        } else {
            rows.forEach { (name, count) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = name,
                        style = LinksnapAnalyticsMetrics.rowMonoStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text =
                            LinksnapAnalyticsCopy.REFERRER_CLICKS.replace(
                                "{count}",
                                count.toString(),
                            ),
                        style = LinksnapAnalyticsMetrics.rowBadgeStyle,
                    )
                }
            }
        }
    }
}

@Composable
private fun ActivityCard(rows: List<Pair<String?, String>>) {
    Card(title = LinksnapAnalyticsCopy.RECENT_ACTIVITY, icon = LucideVectors.Smartphone) {
        if (rows.isEmpty()) {
            EmptySentence(LinksnapAnalyticsCopy.EMPTY_ACTIVITY)
        } else {
            rows.forEach { (agent, clickedAt) ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text =
                            agent?.takeIf { it.isNotBlank() }?.let {
                                if (it.length > 30) it.take(30) + "..." else it
                            } ?: LinksnapAnalyticsCopy.UNKNOWN_BROWSER,
                        style = LinksnapAnalyticsMetrics.rowStyle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = timeOf(clickedAt),
                        style = LinksnapAnalyticsMetrics.rowMonoStyle,
                    )
                }
            }
        }
    }
}

@Composable
private fun Card(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(LinksnapAnalyticsMetrics.cardRadius))
                .background(RoyColors.card)
                .border(
                    1.dp,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapAnalyticsMetrics.cardRadius),
                )
                .padding(LinksnapAnalyticsMetrics.cardPadding),
        verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.cardLabelGap),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LinksnapAnalyticsMetrics.inlineGap),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(16.dp),
                tint = RoyColors.primary,
            )
            Text(
                text = title,
                style =
                    TextStyle(
                        fontSize = LinksnapAnalyticsMetrics.labelSize,
                        lineHeight = LinksnapAnalyticsMetrics.labelLineHeight,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.mutedForeground,
                    ),
            )
        }
        content()
    }
}

@Composable
private fun EmptySentence(label: String) {
    Text(
        text = label,
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        style =
            TextStyle(
                fontSize = LinksnapAnalyticsMetrics.bodySize,
                lineHeight = LinksnapAnalyticsMetrics.bodyLineHeight,
                color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            ),
    )
}

/** `HH:mm` in the reader's own zone, with Latin digits (the digits rule). */
private fun timeOf(clickedAt: String): String =
    runCatching {
            OffsetDateTime.parse(clickedAt)
                .atZoneSameInstant(ZoneId.systemDefault())
                .format(DateTimeFormatter.ofPattern("HH:mm"))
        }
        .getOrDefault("")

internal object LinksnapAnalyticsMetrics {
    const val PRESETS = "linksnap-analytics-presets"

    fun presetTag(range: LinksnapAnalyticsRange): String =
        when (range) {
            LinksnapAnalyticsRange.Last7Days -> "linksnap-analytics-preset-7"
            LinksnapAnalyticsRange.Last30Days -> "linksnap-analytics-preset-30"
            LinksnapAnalyticsRange.Last90Days -> "linksnap-analytics-preset-90"
        }

    val drawerPadding = 24.dp
    val sectionGap = 24.dp
    val cardGap = 16.dp
    val inlineGap = 6.dp

    val surface = Color(0xFF141416)
    val topBorder = Color(0xFF1F1F1F)
    val skeleton = Color(0xFF252528)
    val skeletonHeight = 96.dp

    val presetsRadius = 8.dp
    val presetsSurface = Color(0xFF252528)
    val presetsPadding = 4.dp
    val presetRadius = 6.dp
    val presetGap = 4.dp
    val presetPaddingX = 12.dp
    val presetPaddingY = 6.dp
    val presetSize = 12.sp
    val presetLineHeight = 16.sp

    val cardRadius = 12.dp
    val cardPadding = 16.dp
    val cardLabelGap = 8.dp

    val labelSize = 12.sp
    val labelLineHeight = 16.sp
    val bodySize = 12.sp
    val bodyLineHeight = 16.sp
    val metricValueStyle =
        TextStyle(
            fontSize = 24.sp,
            lineHeight = 32.sp,
            fontWeight = FontWeight.Bold,
            color = RoyColors.foreground,
        )
    val referrerValueStyle =
        TextStyle(
            fontSize = 14.sp,
            lineHeight = 20.sp,
            fontWeight = FontWeight.Bold,
            color = RoyColors.foreground,
        )
    val rowStyle =
        TextStyle(
            fontSize = 12.sp,
            lineHeight = 16.sp,
            color = RoyColors.foreground.copy(alpha = 0.85f),
        )
    val rowMonoStyle =
        TextStyle(
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontFamily = FontFamily.Monospace,
            color = RoyColors.mutedForeground,
        )
    val rowBadgeStyle =
        TextStyle(
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontFamily = FontFamily.Monospace,
            fontWeight = FontWeight.Bold,
            color = RoyColors.foreground,
        )
    val track = Color(0xFF2C2C30)
    val bar = RoyColors.primary.copy(alpha = 0.7f)

    val pillPaddingX = 8.dp
    val pillPaddingY = 2.dp

    val noticeRadius = 8.dp
    val noticeSurface = Color(0xFF1A0A0F)
    val noticeBorder = Color(0xFF4C0519)
    val noticePadding = 12.dp
    val noticeIcon = 16.dp

    data class Tone(val surface: Color, val border: Color, val content: Color, val dot: Color)
    val active =
        Tone(
            surface = Color(0xFF071814),
            border = Color(0xFF083428),
            content = Color(0xFF34D399),
            dot = Color(0xFF10B981),
        )
    val expired =
        Tone(
            surface = Color(0xFF0E0E0E),
            border = Color(0xFF262626),
            content = Color(0xFFA3A3A3),
            dot = Color(0xFF737373),
        )
    val blocked =
        Tone(
            surface = Color(0xFF1A0A0F),
            border = Color(0xFF4C0519),
            content = Color(0xFFFB7185),
            dot = Color(0xFFF43F5E),
        )
}
