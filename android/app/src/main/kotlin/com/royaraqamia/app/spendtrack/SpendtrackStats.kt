package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import com.royaraqamia.app.store.spendtrack.splitItems
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/** One category's share of a window: what the ring draws and the legend names. */
data class CategoryTotal(
    val categoryId: String,
    val name: String,
    val colorHex: String,
    val total: Double,
)

/** One day's total, for the bars. */
data class DailyTotal(val date: String, val total: Double)

/**
 * The site's numbers, computed from the store (#653).
 *
 * A port of `frontend/shared/spendtrack/local-stats.ts`, not a second opinion:
 * the same window test, the same category allocation (a split expense counts
 * against each category it was split into), the same previous-period window and
 * the same three insights. The screens read these instead of the server's
 * aggregates, which is what lets them paint with the radio off.
 *
 * The site's TypeScript suite pins the arithmetic on the web side; the app's
 * `SpendtrackStatsTest` pins the same cases here.
 */
object SpendtrackStats {
    /** Everything in the window, for the categories it was filed under. */
    fun total(
        expenses: List<SpendtrackExpenseRow>,
        start: String,
        end: String,
        filterCategories: List<String> = emptyList(),
    ): Double =
        expenses
            .filter { inRange(it, start, end) && matches(it, filterCategories) }
            .sumOf { it.amount }

    /** The window's days, oldest first, with what was spent on each. */
    fun dailyTotals(
        expenses: List<SpendtrackExpenseRow>,
        start: String,
        end: String,
        filterCategories: List<String> = emptyList(),
    ): List<DailyTotal> =
        expenses
            .filter { inRange(it, start, end) && matches(it, filterCategories) }
            .groupBy { it.date }
            .map { (date, rows) -> DailyTotal(date, rows.sumOf { it.amount }) }
            .sortedBy { it.date }

    /**
     * The ring's slices: each category's total in the window, biggest first.
     *
     * A split expense is counted against every category it was split into, which
     * is the site's reading of the same rows (`categoryBreakdown`): a ring that
     * counted the whole amount against one category would contradict the splits
     * the row already carries.
     */
    fun categoryBreakdown(
        expenses: List<SpendtrackExpenseRow>,
        categories: List<SpendtrackCategoryRow>,
        start: String,
        end: String,
        filterCategories: List<String> = emptyList(),
    ): List<CategoryTotal> {
        val byId = categories.associateBy { it.id }
        val totals = mutableMapOf<String, Double>()

        for (expense in expenses) {
            if (!inRange(expense, start, end)) continue
            val allocations =
                expense.splitItems().takeIf { it.isNotEmpty() }?.map { it.category_id to it.amount }
                    ?: listOf(expense.categoryId to expense.amount)
            for ((categoryId, amount) in allocations) {
                if (filterCategories.isNotEmpty() && !filterCategories.contains(categoryId)) continue
                totals[categoryId] = (totals[categoryId] ?: 0.0) + amount
            }
        }

        return totals
            .filterValues { it > 0 }
            .map { (categoryId, total) ->
                val category = byId[categoryId]
                CategoryTotal(
                    categoryId = categoryId,
                    name = category?.name ?: "—",
                    colorHex = category?.colorHex ?: DEFAULT_COLOR,
                    total = total,
                )
            }
            .sortedByDescending { it.total }
    }

    /**
     * The window of the same length immediately before this one.
     *
     * `2026-01-01..2026-01-31` answers `2025-12-01..2025-12-31`, which is what the
     * site's `previousPeriodRange` computes — the comparison card is only worth
     * drawing if both clients compare the same two spans.
     */
    fun previousPeriodRange(start: String, end: String): Pair<String, String> {
        val from = LocalDate.parse(start)
        val spanDays = ChronoUnit.DAYS.between(from, LocalDate.parse(end))
        val previousEnd = from.minusDays(1)
        val previousStart = from.minusDays(spanDays + 1)
        return ISO.format(previousStart) to ISO.format(previousEnd)
    }

    /** The three insights the strip names, from the same window. */
    fun insights(
        expenses: List<SpendtrackExpenseRow>,
        categories: List<SpendtrackCategoryRow>,
        start: String,
        end: String,
        filterCategories: List<String> = emptyList(),
    ): SpendInsights {
        val total = total(expenses, start, end, filterCategories)
        val breakdown = categoryBreakdown(expenses, categories, start, end, filterCategories)
        val (previousStart, previousEnd) = previousPeriodRange(start, end)
        val previousTotal = total(expenses, previousStart, previousEnd, filterCategories)

        val days =
            ChronoUnit.DAYS.between(LocalDate.parse(start), LocalDate.parse(end)).toDouble() + 1
        val average = if (days > 0) total / days else total

        val top = breakdown.firstOrNull()
        val topCategory =
            if (top != null && total > 0) {
                SpendInsights.TopCategory(top.name, top.colorHex, top.total)
            } else {
                null
            }
        val share = if (top != null && total > 0) top.total / total else 0.0
        val delta =
            if (previousTotal > 0) (total - previousTotal) / previousTotal else null

        return SpendInsights(
            topCategory = topCategory,
            topCategoryShare = share,
            averagePerDay = average,
            previousPeriodTotal = previousTotal,
            deltaPct = delta,
        )
    }

    /** The same shape the web's `SpendInsights` carries, in Kotlin. */
    data class SpendInsights(
        val topCategory: TopCategory?,
        val topCategoryShare: Double,
        val averagePerDay: Double,
        val previousPeriodTotal: Double,
        val deltaPct: Double?,
    ) {
        data class TopCategory(val name: String, val colorHex: String, val total: Double)
    }

    private fun inRange(expense: SpendtrackExpenseRow, start: String, end: String): Boolean =
        expense.date >= start && expense.date <= end

    private fun matches(expense: SpendtrackExpenseRow, filter: List<String>): Boolean =
        filter.isEmpty() || filter.contains(expense.categoryId)

    /** The colour the site uses when a row's category is gone. */
    const val DEFAULT_COLOR = "#8f6fe5"

    private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
}
