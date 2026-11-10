package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/spendtrack` (#958, ADR-0118).
 *
 * It draws the dashboard's own components - the total card, the budget card, the
 * filter bar, the expense list and the two charts - at 393 x 852 CSS px, Arabic,
 * RTL and dark, writes every contract element's numbers to
 * `e2e/__visual__/spendtrack/<state>/app.json` and the first row's pixels to
 * `app.png`. `check:visual` compares them with the page's recording.
 *
 * The rows and the categories are the same fixture the page's recording seeds:
 * two expenses, `غداء` on food and `باص` on transport. `at-rest` paints both and
 * `filtered` narrows the list to food, which is the page's own query state. The
 * widths are the page's own: the dashboard's cards take 361dp inside the page's
 * 16dp gutters, and the filter bar and the rows take 319dp inside the
 * transactions card, which the composition reproduces rather than duplicates.
 *
 * Heights are left out of the contract except the row's, because the app draws
 * the site's data as a ring and a bar strip rather than the site's interactive
 * charts; the row is the region both clients draw from the same state, so its
 * pixels are the raster.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class SpendtrackScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val food =
        SpendtrackCategoryRow(
            id = "e2e00000-0000-4000-8000-000000000001",
            userId = null,
            name = "طعام",
            colorHex = "#f97316",
            createdAt = "2026-11-10T00:00:00.000Z",
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )
    private val transport =
        SpendtrackCategoryRow(
            id = "e2e00000-0000-4000-8000-000000000002",
            userId = null,
            name = "مواصلات",
            colorHex = "#3b82f6",
            createdAt = "2026-11-10T00:00:00.000Z",
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )
    private val lunch =
        SpendtrackExpenseRow(
            id = "e2e00000-0000-4000-8000-000000000003",
            categoryId = food.id,
            amount = 100.0,
            description = "غداء",
            date = "2026-11-10",
            currency = null,
            createdAt = "2026-11-10T00:00:00.000Z",
            splits = null,
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )
    private val bus =
        SpendtrackExpenseRow(
            id = "e2e00000-0000-4000-8000-000000000004",
            categoryId = transport.id,
            amount = 50.0,
            description = "باص",
            date = "2026-11-10",
            currency = null,
            createdAt = "2026-11-10T00:00:00.000Z",
            splits = null,
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )

    private fun width(tag: String): Float {
        val box = compose.onAllNodesWithTag(tag).onFirst().getUnclippedBoundsInRoot()
        return (box.right - box.left).value
    }

    private fun height(tag: String): Float {
        val box = compose.onAllNodesWithTag(tag).onFirst().getUnclippedBoundsInRoot()
        return (box.bottom - box.top).value
    }

    private fun compose(state: SpendtrackFilterState, rows: List<SpendtrackExpenseRow>) {
        val categories = listOf(food, transport)
        val expenses = SpendtrackExpensesUiState.of(rows)
        val window = SpendtrackFilters.window(state)
        val total = SpendtrackStats.total(rows, window.first, window.second)
        val breakdown =
            SpendtrackStats.categoryBreakdown(rows, categories, window.first, window.second)
        val daily = SpendtrackStats.dailyTotals(rows, window.first, window.second)

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        Column(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            SpendtrackTotalCard(
                                total = total,
                                currency = "USD",
                                start = window.first,
                                end = window.second,
                            )
                            SpendtrackBudgetCard(
                                state = SpendtrackBudgetUiState.Unset,
                                spent = total,
                                currency = "USD",
                                month = "2026-11",
                                onSave = { true },
                            )
                            Box(Modifier.padding(horizontal = 21.dp)) {
                                SpendtrackFilterBar(
                                    state = state,
                                    categories = categories,
                                    onChange = {},
                                )
                            }
                            Box(Modifier.padding(horizontal = 21.dp)) {
                                SpendtrackExpenseList(
                                    state = expenses,
                                    categories = categories.associateBy { it.id },
                                    currency = "USD",
                                    onEdit = {},
                                    onDelete = {},
                                    modifier = Modifier.height(180.dp),
                                )
                            }
                            SpendtrackCategoryChart(
                                state = SpendtrackCategoryChartUiState.of(breakdown),
                                currency = "USD",
                            )
                            SpendtrackDailyChart(
                                state = SpendtrackDailyChartUiState.of(daily),
                                currency = "USD",
                            )
                        }
                    }
                }
            }
        }
    }

    private fun record(stateName: String) {
        val json =
            """
            {
              "surface": "spendtrack",
              "elements": {
                "total": {
                  "width": ${width(SpendtrackMetrics.TOTAL_CARD)},
                  "radius": 16
                },
                "budget": {
                  "width": ${width(SpendtrackMetrics.BUDGET_CARD)},
                  "radius": 16
                },
                "filter": {
                  "width": ${width(SpendtrackMetrics.FILTER_BAR)}
                },
                "row": {
                  "width": ${width(SpendtrackMetrics.EXPENSE_ROW)},
                  "height": ${height(SpendtrackMetrics.EXPENSE_ROW)},
                  "radius": 12
                },
                "category-chart": {
                  "width": ${width(SpendtrackMetrics.CATEGORY_CHART)},
                  "radius": 16
                },
                "daily-chart": {
                  "width": ${width(SpendtrackMetrics.DAILY_CHART)},
                  "radius": 16
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/spendtrack/$stateName").apply { mkdirs() }
        File(dir, "app.json").writeText(json + "\n")
        compose
            .onAllNodesWithTag(SpendtrackMetrics.EXPENSE_ROW)
            .onFirst()
            .captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the dashboard records the page's boxes with two rows`() {
        compose(SpendtrackFilterState(), listOf(lunch, bus))
        record("at-rest")
    }

    @Test
    fun `the filtered dashboard records the page's boxes with one row`() {
        compose(
            SpendtrackFilterState(categories = setOf(food.id)),
            listOf(lunch),
        )
        record("filtered")
    }

    /**
     * The create-expense dialog with its amount refused (#960).
     *
     * The page's dialog opens with an empty amount and category; submitting it
     * draws the page's own sentence under each field. The composition is the
     * dialog's own, and the click is what makes the sentence the state rather
     * than a form nobody filled.
     */
    @Test
    fun `the expense dialog records the page's boxes with a refused amount`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        SpendtrackExpenseDialog(
                            editing = null,
                            categories = emptyList(),
                            currency = "USD",
                            onDismiss = {},
                            onSave = { _, _, _, _, _ -> false },
                        )
                    }
                }
            }
        }
        compose.onNodeWithTag(SpendtrackMetrics.EXPENSE_SUBMIT).performClick()
        compose.waitForIdle()

        val json =
            """
            {
              "surface": "spendtrack",
              "elements": {
                "dialog": {
                  "width": ${width(SpendtrackMetrics.EXPENSE_DIALOG)},
                  "radius": ${SpendtrackMetrics.DIALOG_RADIUS.value},
                  "paddingTop": ${SpendtrackMetrics.DIALOG_PADDING.value},
                  "paddingLeft": ${SpendtrackMetrics.DIALOG_PADDING.value}
                },
                "amount": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_AMOUNT)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "category": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_CATEGORY)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "date": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_DATE)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "description": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_DESCRIPTION)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "currency": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_CURRENCY)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "actions": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_ACTIONS)},
                  "columnGap": ${SpendtrackMetrics.ACTION_GAP.value}
                },
                "submit": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_SUBMIT)}
                },
                "error": {
                  "height": ${height(SpendtrackMetrics.EXPENSE_ERROR)},
                  "fontSize": ${12}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/spendtrack/expense-dialog").apply { mkdirs() }
        File(dir, "app.json").writeText(json + "\n")
        compose
            .onNodeWithTag(SpendtrackMetrics.EXPENSE_AMOUNT, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    /**
     * The CSV flow's controls (#961).
     *
     * The page draws the import and export buttons inside the dashboard's 16dp
     * gutters; at the app's 393 CSS px viewport that row is 361 wide, with each
     * control half of it and the page's `gap-2` between them. The export asks the
     * page's own route for the file, so the recording is the controls rather than
     * a second CSV drawn here.
     */
    @Test
    fun `the csv controls record the page's boxes`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
                            SpendtrackCsvButtons(
                                onImport = {},
                                onExport = {},
                                exporting = false,
                            )
                        }
                    }
                }
            }
        }

        val json =
            """
            {
              "surface": "spendtrack",
              "elements": {
                "controls": {
                  "width": ${width(SpendtrackMetrics.CSV_CONTROLS)},
                  "height": ${height(SpendtrackMetrics.CSV_CONTROLS)},
                  "columnGap": ${SpendtrackMetrics.CSV_GAP.value}
                },
                "import": {
                  "height": ${height(SpendtrackMetrics.CSV_IMPORT)},
                  "radius": ${12}
                },
                "export": {
                  "height": ${height(SpendtrackMetrics.CSV_EXPORT)},
                  "radius": ${12}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/spendtrack/csv").apply { mkdirs() }
        File(dir, "app.json").writeText(json + "\n")
        compose
            .onNodeWithTag(SpendtrackMetrics.CSV_CONTROLS)
            .captureRoboImage(File(dir, "app.png").path)
    }

    /**
     * The create-category dialog with its name refused (#960).
     *
     * The page's dialog opens with an empty name; submitting it draws the page's
     * own sentence under the field. The colour is the page's own default, so the
     * only refused field is the name.
     */
    @Test
    fun `the category dialog records the page's boxes with a refused name`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        SpendtrackCategoryDialog(
                            editing = null,
                            onDismiss = {},
                            onSave = { _, _ -> false },
                        )
                    }
                }
            }
        }
        compose.onNodeWithTag(SpendtrackMetrics.CATEGORY_SUBMIT).performClick()
        compose.waitForIdle()

        val json =
            """
            {
              "surface": "spendtrack",
              "elements": {
                "dialog": {
                  "width": ${width(SpendtrackMetrics.CATEGORY_DIALOG)},
                  "radius": ${SpendtrackMetrics.DIALOG_RADIUS.value},
                  "paddingTop": ${SpendtrackMetrics.DIALOG_PADDING.value},
                  "paddingLeft": ${SpendtrackMetrics.DIALOG_PADDING.value}
                },
                "name": {
                  "height": ${height(SpendtrackMetrics.CATEGORY_NAME)},
                  "radius": ${SpendtrackMetrics.FIELD_RADIUS.value}
                },
                "color": {
                  "height": ${height(SpendtrackMetrics.CATEGORY_COLOR)}
                },
                "actions": {
                  "height": ${height(SpendtrackMetrics.CATEGORY_ACTIONS)},
                  "columnGap": ${SpendtrackMetrics.ACTION_GAP.value}
                },
                "submit": {
                  "height": ${height(SpendtrackMetrics.CATEGORY_SUBMIT)}
                },
                "error": {
                  "height": ${height(SpendtrackMetrics.CATEGORY_ERROR)},
                  "fontSize": ${14}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/spendtrack/category-dialog").apply { mkdirs() }
        File(dir, "app.json").writeText(json + "\n")
        compose
            .onNodeWithTag(SpendtrackMetrics.CATEGORY_NAME, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
