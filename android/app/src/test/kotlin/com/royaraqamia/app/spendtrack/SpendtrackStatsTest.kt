package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The numbers the dashboard draws, from the app's side (#653).
 *
 * `frontend/shared/spendtrack/local-stats.ts` is the reference: the same window
 * test, the same split allocation, the same previous-period window and the same
 * three insights. A rule that moves on one side and not the other would show a
 * member two different averages for one month, on two clients, silently — which
 * is what `docs/mobile/two-clients.md` exists to prevent.
 */
class SpendtrackStatsTest {
    private val food = category("c-food", "طعام", "#f00")
    private val travel = category("c-travel", "مواصلات", "#00f")

    @Test
    fun `a total counts the window and honours the category filter`() {
        val rows =
            listOf(
                expense("e-1", "c-food", 10.0, "2026-01-01"),
                expense("e-2", "c-travel", 5.0, "2026-01-31"),
                expense("e-3", "c-food", 99.0, "2025-12-31"),
            )

        assertEquals(15.0, SpendtrackStats.total(rows, "2026-01-01", "2026-01-31"), 0.0)
        assertEquals(
            10.0,
            SpendtrackStats.total(rows, "2026-01-01", "2026-01-31", listOf("c-food")),
            0.0,
        )
    }

    @Test
    fun `the breakdown counts a split expense against every category it was split into`() {
        val rows =
            listOf(
                expense(
                    id = "e-1",
                    categoryId = "c-food",
                    amount = 30.0,
                    date = "2026-01-05",
                    splits =
                        """[{"category_id":"c-food","amount":20.0},{"category_id":"c-travel","amount":10.0}]""",
                )
            )

        val breakdown =
            SpendtrackStats.categoryBreakdown(rows, listOf(food, travel), "2026-01-01", "2026-01-31")

        assertEquals(listOf("c-food", "c-travel"), breakdown.map { it.categoryId })
        assertEquals(20.0, breakdown[0].total, 0.0)
        assertEquals(10.0, breakdown[1].total, 0.0)
    }

    @Test
    fun `the previous window is the same span immediately before`() {
        assertEquals(
            "2025-12-01" to "2025-12-31",
            SpendtrackStats.previousPeriodRange("2026-01-01", "2026-01-31"),
        )
        assertEquals(
            "2026-01-01" to "2026-01-06",
            SpendtrackStats.previousPeriodRange("2026-01-07", "2026-01-12"),
        )
    }

    @Test
    fun `the insights name the biggest category and its share`() {
        val rows =
            listOf(
                expense("e-1", "c-food", 30.0, "2026-01-05"),
                expense("e-2", "c-travel", 10.0, "2026-01-06"),
            )

        val insights =
            SpendtrackStats.insights(rows, listOf(food, travel), "2026-01-01", "2026-01-10")

        assertEquals("طعام", insights.topCategory!!.name)
        assertEquals(0.75, insights.topCategoryShare, 0.0001)
        assertEquals(4.0, insights.averagePerDay, 0.0001)
        assertNull("nothing before this window", insights.deltaPct)
        assertEquals(0.0, insights.previousPeriodTotal, 0.0)
    }

    @Test
    fun `the delta compares with the window before`() {
        val rows =
            listOf(
                expense("e-1", "c-food", 30.0, "2026-01-05"),
                expense("e-2", "c-food", 20.0, "2025-12-25"),
            )

        val insights =
            SpendtrackStats.insights(rows, listOf(food), "2026-01-01", "2026-01-10")

        assertEquals(0.5, insights.deltaPct!!, 0.0001)
    }

    @Test
    fun `a day is one bar, and an empty window has none`() {
        val rows =
            listOf(
                expense("e-1", "c-food", 10.0, "2026-01-02"),
                expense("e-2", "c-food", 5.0, "2026-01-02"),
                expense("e-3", "c-food", 7.0, "2026-01-01"),
            )

        val daily = SpendtrackStats.dailyTotals(rows, "2026-01-01", "2026-01-31")

        assertEquals(listOf("2026-01-01", "2026-01-02"), daily.map { it.date })
        assertEquals(15.0, daily[1].total, 0.0)
        assertEquals(emptyList<DailyTotal>(), SpendtrackStats.dailyTotals(rows, "2026-02-01", "2026-02-28"))
    }

    private fun category(id: String, name: String, colorHex: String) =
        SpendtrackCategoryRow(
            id = id,
            userId = "alice-id",
            name = name,
            colorHex = colorHex,
            createdAt = "2026-01-01T00:00:00.000Z",
            clientId = id,
            updatedAt = "2026-01-01T00:00:00.000Z",
            deletedAt = null,
        )

    private fun expense(
        id: String,
        categoryId: String,
        amount: Double,
        date: String,
        splits: String? = null,
    ) =
        SpendtrackExpenseRow(
            id = id,
            categoryId = categoryId,
            amount = amount,
            description = null,
            date = date,
            currency = null,
            createdAt = "${date}T00:00:00.000Z",
            splits = splits,
            clientId = id,
            updatedAt = "${date}T00:00:00.000Z",
            deletedAt = null,
        )
}
