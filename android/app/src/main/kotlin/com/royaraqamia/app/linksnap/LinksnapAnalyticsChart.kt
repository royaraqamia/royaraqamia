package com.royaraqamia.app.linksnap

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsClicksByDateItem
import com.royaraqamia.app.theme.RoyColors
import java.time.LocalDate
import java.time.chrono.HijrahChronology
import java.time.chrono.HijrahDate
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The owned link's click chart (#963), ported from
 * `frontend/ui/linksnap/analytics-chart.tsx`.
 *
 * The page draws an area chart over the period's days: five dashed grid lines
 * with the click total on the y axis, one marker per day, and the Hijri day under
 * each marker. The geometry is [LinksnapChartGeometry], the same numbers the
 * page's SVG viewBox uses, so a day lands at the same fraction of the plot on
 * both clients. A period with one day puts that day at the midpoint and a period
 * with no clicks draws the same flat line the page does; only an empty period
 * draws the dashed sentence.
 *
 * Every visible word is [LinksnapAnalyticsChartCopy], generated from the same
 * source the page reads (ADR-0098). The axis values and the day labels are the
 * server's data and are formatted rather than retyped, with ASCII digits.
 */
@Composable
internal fun LinksnapAnalyticsChart(
    state: LinksnapAnalyticsChartUiState,
    modifier: Modifier = Modifier,
) {
    when (state) {
        LinksnapAnalyticsChartUiState.Empty -> EmptyChart(modifier)
        is LinksnapAnalyticsChartUiState.Ready -> PaintedChart(state.stats, modifier)
    }
}

@Composable
private fun EmptyChart(modifier: Modifier) {
    Box(
        modifier =
            modifier
                .testTag(LinksnapAnalyticsChartMetrics.EMPTY)
                .fillMaxWidth()
                .height(LinksnapAnalyticsChartMetrics.emptyHeight)
                .clip(RoundedCornerShape(LinksnapAnalyticsChartMetrics.cardRadius))
                .background(LinksnapAnalyticsChartMetrics.emptySurface)
                .border(
                    1.dp,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapAnalyticsChartMetrics.cardRadius),
                ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = LinksnapAnalyticsChartCopy.EMPTY,
            style = LinksnapAnalyticsChartMetrics.emptyStyle,
        )
    }
}

@Composable
private fun PaintedChart(stats: List<LinksnapAnalyticsResponseAnalyticsClicksByDateItem>, modifier: Modifier) {
    Column(
        modifier =
            modifier
                .testTag(LinksnapAnalyticsChartMetrics.CHART)
                .fillMaxWidth()
                .clip(RoundedCornerShape(LinksnapAnalyticsChartMetrics.cardRadius))
                .background(RoyColors.card)
                .border(
                    1.dp,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapAnalyticsChartMetrics.cardRadius),
                )
                .padding(LinksnapAnalyticsChartMetrics.cardPadding),
    ) {
        Box(
            modifier =
                Modifier.testTag(LinksnapAnalyticsChartMetrics.TITLE)
                    .fillMaxWidth()
                    .height(LinksnapAnalyticsChartMetrics.titleLineHeight),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = LinksnapAnalyticsChartCopy.TITLE,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = LinksnapAnalyticsChartMetrics.titleStyle,
            )
        }

        Spacer(Modifier.height(LinksnapAnalyticsChartMetrics.titleGap))

        Plot(stats)
    }
}

@Composable
private fun Plot(stats: List<LinksnapAnalyticsResponseAnalyticsClicksByDateItem>) {
    val textMeasurer = rememberTextMeasurer()
    val points = LinksnapChartGeometry.points(stats)
    val maxClicks = LinksnapChartGeometry.maxClicks(stats)
    val axis = LinksnapChartGeometry.axisValues(maxClicks)

    BoxWithConstraints(
        modifier =
            Modifier.testTag(LinksnapAnalyticsChartMetrics.PLOT)
                .fillMaxWidth()
                .aspectRatio(LinksnapChartGeometry.WIDTH / LinksnapChartGeometry.HEIGHT)
                .semantics { contentDescription = LinksnapAnalyticsChartCopy.ARIA_LABEL },
    ) {
        // One SVG user unit, in the app's own pixels: the page's viewBox is
        // 500 x 180 and its svg is as wide as the card's content box.
        val scale = maxWidth.value / LinksnapChartGeometry.WIDTH
        val plotTop = LinksnapChartGeometry.PADDING_TOP * scale

        Canvas(Modifier.fillMaxSize()) {
            val unit = size.width / LinksnapChartGeometry.WIDTH
            val left = LinksnapChartGeometry.PADDING_LEFT * unit
            val right = (LinksnapChartGeometry.WIDTH - LinksnapChartGeometry.PADDING_RIGHT) * unit
            val top = LinksnapChartGeometry.PADDING_TOP * unit
            val bottom = (LinksnapChartGeometry.PADDING_TOP + LinksnapChartGeometry.CHART_HEIGHT) * unit

            // Grid lines and their click totals, drawn top to bottom.
            axis.forEachIndexed { index, value ->
                val ratio = index / (axis.size - 1f)
                val y = top + (bottom - top) * ratio
                drawLine(
                    color = RoyColors.border.copy(alpha = 0.4f),
                    start = Offset(left, y),
                    end = Offset(right, y),
                    strokeWidth = unit,
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * unit, 4 * unit)),
                )
                val label =
                    textMeasurer.measure(
                        AnnotatedString(value.toString()),
                        style = LinksnapAnalyticsChartMetrics.axisStyle(scale),
                    )
                drawText(
                    textLayoutResult = label,
                    topLeft =
                        Offset(
                            x = (LinksnapChartGeometry.PADDING_LEFT - 10) * unit - label.size.width,
                            y = y + 4 * unit - label.size.height,
                        ),
                )
            }

            if (points.isEmpty()) return@Canvas

            val coordinates = points.map { Offset(it.x * unit, it.y * unit) }

            // The area under the line, then the line itself.
            if (coordinates.size > 1) {
                val area =
                    Path().apply {
                        moveTo(coordinates.first().x, coordinates.first().y)
                        coordinates.drop(1).forEach { lineTo(it.x, it.y) }
                        lineTo(coordinates.last().x, bottom)
                        lineTo(coordinates.first().x, bottom)
                        close()
                    }
                drawPath(
                    path = area,
                    brush =
                        Brush.verticalGradient(
                            colors =
                                listOf(
                                    RoyColors.primary.copy(alpha = 0.2f),
                                    RoyColors.primary.copy(alpha = 0f),
                                ),
                            startY = top,
                            endY = bottom,
                        ),
                )

                val line =
                    Path().apply {
                        moveTo(coordinates.first().x, coordinates.first().y)
                        coordinates.drop(1).forEach { lineTo(it.x, it.y) }
                    }
                drawPath(
                    path = line,
                    color = RoyColors.primary,
                    style =
                        Stroke(
                            width = 2.5f * unit,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        ),
                )
            }

            // One marker per day, with the page's background ring around it.
            coordinates.forEach { point ->
                drawCircle(
                    color = RoyColors.background,
                    radius = 5f * unit,
                    center = point,
                )
                drawCircle(
                    color = RoyColors.primary,
                    radius = 4f * unit,
                    center = point,
                )
            }

            // The Hijri day under each marker.
            points.forEachIndexed { index, point ->
                val label =
                    textMeasurer.measure(
                        AnnotatedString(LinksnapChartGeometry.dateLabel(stats[index].date)),
                        style = LinksnapAnalyticsChartMetrics.dateStyle(scale),
                    )
                drawText(
                    textLayoutResult = label,
                    topLeft =
                        Offset(
                            x = point.x * unit - label.size.width / 2f,
                            y = (LinksnapChartGeometry.HEIGHT - 10) * unit - label.size.height,
                        ),
                )
            }
        }

        // The contract's named halves of the plot: the first and last day's
        // marker. They are the design's boxes; the drawing above is what lands
        // inside them, and the raster is what proves the rest.
        if (points.isNotEmpty()) {
            val size = LinksnapAnalyticsChartMetrics.markerSize(scale)
            Box(
                Modifier.offset(
                        x = (points.first().x * scale).dp - size / 2f,
                        y = (points.first().y * scale).dp - size / 2f,
                    )
                    .size(size)
                    .testTag(LinksnapAnalyticsChartMetrics.FIRST),
            )
            Box(
                Modifier.offset(
                        x = (points.last().x * scale).dp - size / 2f,
                        y = (points.last().y * scale).dp - size / 2f,
                    )
                    .size(size)
                    .testTag(LinksnapAnalyticsChartMetrics.LAST),
            )
        }

        // The y axis' first tick, named for the contract. It draws no text of
        // its own: the Canvas above is the tick.
        Box(
            Modifier.offset(
                    x = ((LinksnapChartGeometry.PADDING_LEFT - 10) * scale).dp,
                    y = plotTop.dp,
                )
                .testTag(LinksnapAnalyticsChartMetrics.AXIS_LABEL),
        )
    }
}

/**
 * The page's chart geometry, as numbers both clients can agree on (#963).
 *
 * These are the SVG viewBox' own units: everything is divided out of the 500 x
 * 180 plot, so the app scales exactly as the page's `w-full h-auto` does.
 */
internal object LinksnapChartGeometry {
    const val WIDTH = 500f
    const val HEIGHT = 180f
    const val PADDING_LEFT = 40f
    const val PADDING_RIGHT = 20f
    const val PADDING_TOP = 20f
    const val PADDING_BOTTOM = 30f

    const val CHART_WIDTH = WIDTH - PADDING_LEFT - PADDING_RIGHT
    const val CHART_HEIGHT = HEIGHT - PADDING_TOP - PADDING_BOTTOM

    /** The page never squashes the axis below five, so a quiet week still reads. */
    const val MIN_MAX_CLICKS = 5L

    data class Point(val x: Float, val y: Float, val clicks: Long)

    fun maxClicks(stats: List<LinksnapAnalyticsResponseAnalyticsClicksByDateItem>): Float =
        maxOf(stats.maxOfOrNull { it.clicks } ?: 0L, MIN_MAX_CLICKS).toFloat()

    /**
     * One point per day. A single day sits at the midpoint, exactly as the page's
     * `stats.length === 1 ? 0.5` places it, and no day at all is no points.
     */
    fun points(stats: List<LinksnapAnalyticsResponseAnalyticsClicksByDateItem>): List<Point> {
        if (stats.isEmpty()) return emptyList()
        val max = maxClicks(stats)
        return stats.mapIndexed { index, stat ->
            val t = if (stats.size == 1) 0.5f else index / (stats.size - 1f)
            Point(
                x = PADDING_LEFT + t * CHART_WIDTH,
                y = PADDING_TOP + CHART_HEIGHT - (stat.clicks / max) * CHART_HEIGHT,
                clicks = stat.clicks,
            )
        }
    }

    /** The five grid totals, top to bottom: the round of `maxClicks * (1 - ratio)`. */
    fun axisValues(maxClicks: Float): List<Int> =
        listOf(0f, 0.25f, 0.5f, 0.75f, 1f).map { ratio ->
            (maxClicks * (1 - ratio)).roundToInt()
        }

    /** `2026-11-08` as the page's `Intl` prints it: `8 جمادى الأولى`, ASCII digits. */
    fun dateLabel(day: String): String {
        val date = runCatching { LocalDate.parse(day) }.getOrElse { return day }
        return datePattern.format(HijrahDate.from(date))
    }

    private val datePattern: DateTimeFormatter =
        DateTimeFormatter.ofPattern("d MMM", Locale.forLanguageTag("ar"))
            .withChronology(HijrahChronology.INSTANCE)
            .withDecimalStyle(DecimalStyle.STANDARD)
}

internal object LinksnapAnalyticsChartMetrics {
    const val CHART = "linksnap-analytics-chart"
    const val TITLE = "linksnap-analytics-chart-title"
    const val PLOT = "linksnap-analytics-chart-plot"
    const val FIRST = "linksnap-analytics-chart-first"
    const val LAST = "linksnap-analytics-chart-last"
    const val AXIS_LABEL = "linksnap-analytics-chart-axis"
    const val EMPTY = "linksnap-analytics-chart-empty"

    val cardRadius = 12.dp
    val cardPadding = 24.dp
    val titleLineHeight = 20.dp
    val titleGap = 16.dp
    val emptyHeight = 256.dp
    val emptySurface = Color(0xFF252528)

    /** The design's declared type sizes, on the page's 500-unit viewBox. */
    const val titleFontSize = 14f
    const val titleLineHeightUnits = 20f
    const val axisFontSize = 10f
    const val dateFontSize = 9f

    val titleStyle =
        TextStyle(
            fontSize = titleFontSize.sp,
            lineHeight = titleLineHeightUnits.sp,
            fontWeight = FontWeight.Medium,
            letterSpacing = 0.7.sp,
            color = RoyColors.mutedForeground,
        )

    val emptyStyle =
        TextStyle(
            fontSize = 14.sp,
            lineHeight = 20.sp,
            color = RoyColors.mutedForeground,
        )

    fun axisStyle(scale: Float) =
        TextStyle(
            fontSize = (axisFontSize * scale).sp,
            fontFamily = FontFamily.Monospace,
            color = RoyColors.mutedForeground,
        )

    fun dateStyle(scale: Float) =
        TextStyle(
            fontSize = (dateFontSize * scale).sp,
            fontFamily = FontFamily.Monospace,
            color = RoyColors.mutedForeground,
        )

    /** The marker's ringed diameter in the page's units (r = 4, so 8 across). */
    fun markerSize(scale: Float) = (8f * scale).dp
}
