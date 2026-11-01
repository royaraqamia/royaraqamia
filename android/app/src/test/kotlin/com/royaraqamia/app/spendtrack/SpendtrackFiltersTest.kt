package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The filter bar's arithmetic (#653).
 *
 * The site keeps the same state in the URL and filters with `getDateRange` and
 * the list's own ordering; these cases pin that the app's windows, its category
 * and search tests and its four orders answer the same way, so a member who
 * filters to "last 7 days" sees the same rows on both clients.
 */
class SpendtrackFiltersTest {
    private val today = LocalDate.parse("2026-01-10")

    @Test
    fun `each window is the site's window`() {
        assertEquals(
            "2026-01-01" to "2026-01-31",
            SpendtrackFilters.window(SpendtrackFilterState(SpendtrackRange.THIS_MONTH), today),
        )
        assertEquals(
            "2026-01-04" to "2026-01-10",
            SpendtrackFilters.window(SpendtrackFilterState(SpendtrackRange.LAST_7), today),
        )
        assertEquals(
            "2025-12-12" to "2026-01-10",
            SpendtrackFilters.window(SpendtrackFilterState(SpendtrackRange.LAST_30), today),
        )
    }

    @Test
    fun `the search is the description the row shows`() {
        val rows =
            listOf(
                expense("e-1", "c-1", 10.0, "2026-01-05", "غداء في المطعم"),
                expense("e-2", "c-1", 20.0, "2026-01-06", null),
            )

        val filtered =
            SpendtrackFilters.apply(
                rows,
                SpendtrackFilterState(search = "المطعم"),
                today,
            )

        assertEquals(listOf("e-1"), filtered.map { it.id })
    }

    @Test
    fun `a category filter is a set, and clears the rows outside it`() {
        val rows =
            listOf(
                expense("e-1", "c-1", 10.0, "2026-01-05"),
                expense("e-2", "c-2", 20.0, "2026-01-06"),
            )

        val filtered =
            SpendtrackFilters.apply(
                rows,
                SpendtrackFilterState(categories = setOf("c-2")),
                today,
            )

        assertEquals(listOf("e-2"), filtered.map { it.id })
    }

    @Test
    fun `the four orders are the site's four orders`() {
        val rows =
            listOf(
                expense("e-1", "c-1", 30.0, "2026-01-05"),
                expense("e-2", "c-1", 10.0, "2026-01-06"),
            )

        fun ids(sort: SpendtrackSort) =
            SpendtrackFilters.apply(rows, SpendtrackFilterState(sort = sort), today).map { it.id }

        assertEquals(listOf("e-2", "e-1"), ids(SpendtrackSort.DATE_DESC))
        assertEquals(listOf("e-1", "e-2"), ids(SpendtrackSort.DATE_ASC))
        assertEquals(listOf("e-1", "e-2"), ids(SpendtrackSort.AMOUNT_DESC))
        assertEquals(listOf("e-2", "e-1"), ids(SpendtrackSort.AMOUNT_ASC))
    }

    @Test
    fun `the default filter is what the screen opens on`() {
        assertEquals(SpendtrackRange.THIS_MONTH, SpendtrackFilterState().range)
        assertEquals(SpendtrackSort.DATE_DESC, SpendtrackFilterState().sort)
        assertEquals(true, SpendtrackFilterState().isDefault)
        assertEquals(false, SpendtrackFilterState(search = "x").isDefault)
    }

    private fun expense(
        id: String,
        categoryId: String,
        amount: Double,
        date: String,
        description: String? = null,
    ) =
        SpendtrackExpenseRow(
            id = id,
            categoryId = categoryId,
            amount = amount,
            description = description,
            date = date,
            currency = null,
            createdAt = "${date}T00:00:00.000Z",
            splits = null,
            clientId = id,
            updatedAt = "${date}T00:00:00.000Z",
            deletedAt = null,
        )
}
