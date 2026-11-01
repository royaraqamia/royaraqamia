package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** The windows the site offers, in the order it offers them. */
enum class SpendtrackRange(val wire: String, val label: String) {
    THIS_MONTH("this_month", SpendtrackFiltersCopy.THIS_MONTH),
    LAST_7("last_7", SpendtrackFiltersCopy.LAST7),
    LAST_30("last_30", SpendtrackFiltersCopy.LAST30),
    ALL("all", SpendtrackFiltersCopy.ALL),
}

/** The orders the site offers. */
enum class SpendtrackSort(val wire: String, val label: String) {
    DATE_DESC("date_desc", SpendtrackFiltersCopy.DATE_DESC),
    DATE_ASC("date_asc", SpendtrackFiltersCopy.DATE_ASC),
    AMOUNT_DESC("amount_desc", SpendtrackFiltersCopy.AMOUNT_DESC),
    AMOUNT_ASC("amount_asc", SpendtrackFiltersCopy.AMOUNT_ASC),
}

/**
 * What the filter bar is set to (#653), the app's half of
 * `frontend/ui/spendtrack/transaction-filters.tsx`.
 *
 * The site keeps this in the URL because it is view state, not a server input;
 * the app keeps it in memory for the same reason — it filters rows that are
 * already on disk, so changing it never spends a request.
 */
data class SpendtrackFilterState(
    val range: SpendtrackRange = SpendtrackRange.THIS_MONTH,
    val categories: Set<String> = emptySet(),
    val search: String = "",
    val sort: SpendtrackSort = SpendtrackSort.DATE_DESC,
) {
    val isDefault: Boolean
        get() = this == SpendtrackFilterState()
}

/**
 * The window a filter names, in the site's own arithmetic.
 *
 * `this_month` is the month the device is in, `last_7` and `last_30` are the
 * days up to today inclusive (`subDays(now, 6)` on the site, which is seven days
 * counting today), and `all` is wide enough to hold every row a person could
 * have written.
 */
object SpendtrackFilters {
    fun window(state: SpendtrackFilterState, today: LocalDate = LocalDate.now()): Pair<String, String> =
        when (state.range) {
            SpendtrackRange.THIS_MONTH ->
                ISO.format(today.withDayOfMonth(1)) to ISO.format(today.withDayOfMonth(today.lengthOfMonth()))
            SpendtrackRange.LAST_7 -> ISO.format(today.minusDays(6)) to ISO.format(today)
            SpendtrackRange.LAST_30 -> ISO.format(today.minusDays(29)) to ISO.format(today)
            SpendtrackRange.ALL -> "1900-01-01" to "2099-12-31"
        }

    /**
     * The rows the list paints: the window, the chosen categories, the search
     * text against the description, then the order.
     *
     * A row with no description is not a match for a search, which is the site's
     * reading too — `search` filters on the description it can see.
     */
    fun apply(
        rows: List<SpendtrackExpenseRow>,
        state: SpendtrackFilterState,
        today: LocalDate = LocalDate.now(),
    ): List<SpendtrackExpenseRow> {
        val (start, end) = window(state, today)
        val needle = state.search.trim()

        val filtered =
            rows.filter { row ->
                row.date >= start &&
                    row.date <= end &&
                    (state.categories.isEmpty() || state.categories.contains(row.categoryId)) &&
                    (needle.isEmpty() || row.description?.contains(needle, ignoreCase = true) == true)
            }

        return when (state.sort) {
            SpendtrackSort.DATE_DESC -> filtered.sortedWith(compareByDescending<SpendtrackExpenseRow> { it.date }.thenBy { it.id })
            SpendtrackSort.DATE_ASC -> filtered.sortedWith(compareBy<SpendtrackExpenseRow> { it.date }.thenBy { it.id })
            SpendtrackSort.AMOUNT_DESC -> filtered.sortedWith(compareByDescending<SpendtrackExpenseRow> { it.amount }.thenBy { it.id })
            SpendtrackSort.AMOUNT_ASC -> filtered.sortedWith(compareBy<SpendtrackExpenseRow> { it.amount }.thenBy { it.id })
        }
    }

    /** The categories a picker offers, by name — the site's ordering. */
    fun categoryChoices(categories: List<SpendtrackCategoryRow>): List<SpendtrackCategoryRow> =
        categories.sortedBy { it.name }

    private val ISO: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE
}
