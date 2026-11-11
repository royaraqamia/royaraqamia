package com.royaraqamia.app.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsClicksByDateItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The analytics chart's shape (#963).
 *
 * The page's SVG places the plot on a 500 x 180 viewBox: the first day at 40,
 * the last at 480, one day at the midpoint, and the click axis never below five
 * so a quiet week still reads. These are the cases the acceptance names - an
 * empty period, a single day, and a period with no clicks - kept as arithmetic
 * so a shape that changes is caught here rather than only in a raster.
 */
class LinksnapAnalyticsChartGeometryTest {
    private fun stat(date: String, clicks: Long) =
        LinksnapAnalyticsResponseAnalyticsClicksByDateItem(date = date, clicks = clicks)

    @Test
    fun `an empty period has no points`() {
        assertTrue(LinksnapChartGeometry.points(emptyList()).isEmpty())
    }

    @Test
    fun `a single day sits at the midpoint`() {
        val point = LinksnapChartGeometry.points(listOf(stat("2026-11-11", 3))).single()

        assertEquals(260f, point.x, 0.001f)
        assertEquals(72f, point.y, 0.001f)
    }

    @Test
    fun `a period with no clicks is the page's flat line, not an empty plot`() {
        val stats = (0..7).map { stat("2026-11-0${it + 1}", 0) }
        val points = LinksnapChartGeometry.points(stats)

        assertEquals(8, points.size)
        assertEquals(LinksnapChartGeometry.PADDING_LEFT, points.first().x, 0.001f)
        assertEquals(
            LinksnapChartGeometry.PADDING_LEFT + LinksnapChartGeometry.CHART_WIDTH,
            points.last().x,
            0.001f,
        )
        points.forEach { point ->
            assertEquals(
                LinksnapChartGeometry.PADDING_TOP + LinksnapChartGeometry.CHART_HEIGHT,
                point.y,
                0.001f,
            )
        }
    }

    @Test
    fun `the axis never squashes below five clicks`() {
        assertEquals(listOf(5, 4, 3, 1, 0), LinksnapChartGeometry.axisValues(5f))
        assertEquals(listOf(12, 9, 6, 3, 0), LinksnapChartGeometry.axisValues(12f))
    }
}
