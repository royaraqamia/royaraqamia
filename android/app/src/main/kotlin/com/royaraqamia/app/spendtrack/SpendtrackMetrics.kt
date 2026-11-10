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

    // The two dialogs (#960): the page's own boxes, from `expense-dialog.tsx`
    // and `create-category-dialog.tsx` at the app's 393 CSS px viewport.
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

    const val CATEGORY_DIALOG = "spendtrack-category-dialog"
    const val CATEGORY_FORM = "spendtrack-category-form"
    const val CATEGORY_NAME = "spendtrack-category-name"
    const val CATEGORY_COLOR = "spendtrack-category-color"
    const val CATEGORY_ACTIONS = "spendtrack-category-actions"
    const val CATEGORY_SUBMIT = "spendtrack-category-submit"
    const val CATEGORY_ERROR = "spendtrack-category-error"

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

    /** `space-y-5` on the expense form, `space-y-4` on the category form. */
    val EXPENSE_FORM_GAP = 20.dp
    val CATEGORY_FORM_GAP = 16.dp

    /** The page's refused sentence: `text-xs` (16px line) and `text-sm` (20px). */
    val EXPENSE_ERROR_LINE: TextUnit = 16.sp
    val CATEGORY_ERROR_LINE: TextUnit = 20.sp
    val EXPENSE_ERROR_HEIGHT = 16.dp
    val CATEGORY_ERROR_HEIGHT = 20.dp
}
