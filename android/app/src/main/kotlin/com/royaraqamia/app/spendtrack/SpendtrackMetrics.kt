package com.royaraqamia.app.spendtrack

import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The test tags and the page's numbers the visual gate reads (#958, #960,
 * ADR-0118, ADR-0119).
 *
 * The page's `data-visual` anchors and these tags are one list: `check:visual`
 * measures the same named boxes on both clients, so a renamed tag is a contract
 * change rather than a rename. The objects live beside the components so the
 * screen and the gate's test draw with the same names.
 */
object SpendtrackMetrics {
    const val TOTAL_CARD = "spendtrack-total"
    const val BUDGET_CARD = "spendtrack-budget"
    const val FILTER_BAR = "spendtrack-filter"
    const val EXPENSE_ROW = "spendtrack-row"
    const val CATEGORY_CHART = "spendtrack-category-chart"
    const val DAILY_CHART = "spendtrack-daily-chart"

    // The CSV flow (#961): the page's `h-10`, `rounded-xl` and `gap-2` on the
    // two controls, from `csv-actions.tsx` at 393 CSS px.
    const val CSV_CONTROLS = "spendtrack-csv"
    const val CSV_IMPORT = "spendtrack-csv-import"
    const val CSV_EXPORT = "spendtrack-csv-export"
    val CSV_HEIGHT = 40.dp
    val CSV_GAP = 8.dp

    // The dialog's own boxes, from `expense-dialog.tsx` at the app's 393 CSS px viewport.
    const val EXPENSE_DIALOG = "spendtrack-expense-dialog"
    const val EXPENSE_FORM = "spendtrack-expense-form"
    const val EXPENSE_AMOUNT = "spendtrack-expense-amount"
    const val EXPENSE_CATEGORY = "spendtrack-expense-category"
    const val EXPENSE_DATE = "spendtrack-expense-date"
    const val EXPENSE_DESCRIPTION = "spendtrack-expense-description"
    const val EXPENSE_CURRENCY = "spendtrack-expense-currency"
    const val EXPENSE_ACTIONS = "spendtrack-expense-actions"
    const val EXPENSE_SUBMIT = "spendtrack-expense-submit"
    const val EXPENSE_ERROR = "spendtrack-expense-error"


    /** The page's dialog: `w-[calc(100%-2rem)] max-w-md` at 393 is 361. */
    val DIALOG_WIDTH = 361.dp
    val DIALOG_RADIUS = 24.dp
    val DIALOG_PADDING = 24.dp

    /** `h-11` fields and `rounded-xl`, the page's own input geometry. */
    val FIELD_HEIGHT = 44.dp
    val FIELD_RADIUS = 12.dp

    /** The page's mobile footer: `pt-2`, two stacked actions and `gap-3`. */
    val ACTION_TOP_PADDING = 8.dp
    val ACTION_GAP = 12.dp
    val ACTION_SUBMIT_HEIGHT = 48.dp
    val ACTION_CANCEL_HEIGHT = 52.dp

    /** `space-y-5` on the expense form. */
    val EXPENSE_FORM_GAP = 20.dp

    /** The page's refused sentence: `text-xs` (16px line). */
    val EXPENSE_ERROR_LINE: TextUnit = 16.sp
    val EXPENSE_ERROR_HEIGHT = 16.dp
}
