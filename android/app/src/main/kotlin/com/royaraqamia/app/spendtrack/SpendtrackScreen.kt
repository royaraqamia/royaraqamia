package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.shell.ServicesCopy
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import com.royaraqamia.app.store.spendtrack.SpendtrackRecurringRow
import com.royaraqamia.app.store.spendtrack.SpendtrackRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import kotlinx.coroutines.launch

/**
 * SpendTrack, drawn from the device (#653).
 *
 * Two routes, one screen: `/spendtrack` is the total and the expense list,
 * `/spendtrack/categories` is the categories, which is the same pair the site
 * splits its surface into. Both are one file because the surface matrix gives
 * them one row (`perf/surfaces.json`), and a screen the shell cannot name twice
 * is a screen `npm run check:screens` refuses.
 *
 * The order of the reads is HabitFlow's (#649, #650), not a second opinion:
 * [SpendtrackRepository.expenses] and [SpendtrackRepository.categories] answer
 * from the database and are awaited *first*, so the frame after the shell's is
 * the rows the last pull wrote — a cold launch with the radio off paints from
 * here. The drain and the pull run beside them and never in front of them: a
 * failure is a [SyncPillState], not an empty list.
 *
 * Every write commits the row **and** its replay intent in one transaction, so
 * what the user sees happen has already survived the process before the request
 * is attempted. The queue also drains with the app closed
 * ([com.royaraqamia.app.sync.OutboxDrainWorker]) and on reconnection
 * ([com.royaraqamia.app.shell.ShellActivity]), which is what makes an offline
 * write reach the server without this screen being open.
 *
 * What the site draws and this slice does not: the split editor, the budget
 * card, the recurring list, CSV import/export, and the charts. They are listed
 * in the pull request that landed the screen rather than implied by a missing
 * button.
 */
@Composable
fun SpendtrackScreen(
    route: String,
    repository: SpendtrackRepository,
    modifier: Modifier = Modifier,
    onOpenCategories: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var expenses by remember { mutableStateOf<SpendtrackExpensesUiState>(SpendtrackExpensesUiState.Empty) }
    var categories by remember {
        mutableStateOf<SpendtrackCategoriesUiState>(SpendtrackCategoriesUiState.Empty)
    }
    var budget by remember { mutableStateOf<SpendtrackBudgetUiState>(SpendtrackBudgetUiState.Unset) }
    var recurring by remember {
        mutableStateOf<SpendtrackRecurringUiState>(SpendtrackRecurringUiState.Empty)
    }
    var recurringForm by remember { mutableStateOf<SpendtrackRecurringTarget?>(null) }
    var currency by remember { mutableStateOf<String?>(null) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }

    var addingExpense by remember { mutableStateOf(false) }
    var editingExpense by remember { mutableStateOf<SpendtrackExpenseRow?>(null) }
    var categoryForm by remember { mutableStateOf<SpendtrackCategoryFormTarget?>(null) }

    /** Repaint from the store alone: no network, no session, no wait. */
    suspend fun paint() {
        expenses = SpendtrackExpensesUiState.of(repository.expenses())
        categories = SpendtrackCategoriesUiState.of(repository.categories())
        budget = SpendtrackBudgetUiState.of(repository.budget(currentMonth())?.amount)
        recurring = SpendtrackRecurringUiState.of(repository.recurring())
        currency = repository.currency()
    }

    /**
     * The delivery half: drain what is queued, then pull what is new.
     *
     * A radio that is off is not a failed sync — it is the pill's Offline state,
     * and the queued count comes from the queue itself rather than from a guess.
     */
    suspend fun sync() {
        paint()
        if (!Connectivity.isOnline(context)) {
            pill = SyncPillState.Offline(repository.outboxStatus().pending)
            return
        }
        pill = SyncPillState.Syncing
        val report = repository.drain()
        val pulled = repository.pull()
        paint()
        pill =
            when {
                report.failed > 0 -> SyncPillState.Failed(report.failed)
                pulled is ApiResult.Failure -> SyncPillState.RefreshFailed
                report.pending > 0 -> SyncPillState.Pending(report.pending)
                else -> null
            }
    }

    LaunchedEffect(repository, route) { sync() }

    // The radio returning is the trigger "a queued write drains", so this screen
    // hears it too rather than waiting for a recomposition that may never come.
    DisposableEffect(repository) {
        val watch = Connectivity.watch(context) { scope.launch { sync() } }
        onDispose { watch.close() }
    }

    val categoryRows = (categories as? SpendtrackCategoriesUiState.Painted)?.rows.orEmpty()
    val categoryById: Map<String, SpendtrackCategoryRow> = categoryRows.associateBy { it.id }

    val header: @Composable () -> Unit = {
        SpendtrackHeader(
            route = route,
            pill = pill,
            onRetry = {
                scope.launch {
                    repository.retryFailed()
                    sync()
                }
            },
            onAdd = {
                if (route == CATEGORIES_ROUTE) {
                    categoryForm = SpendtrackCategoryFormTarget.New
                } else {
                    addingExpense = true
                }
            },
            onOpenCategories = onOpenCategories,
        )
    }

    if (route == CATEGORIES_ROUTE) {
        SpendtrackCategoryList(
            state = categories,
            onEdit = { categoryForm = SpendtrackCategoryFormTarget.Edit(it) },
            onDelete = { row -> scope.launch { repository.deleteCategory(row.id); sync() } },
            modifier = modifier,
            header = header,
        )
    } else {
        SpendtrackExpenseList(
            state = expenses,
            categories = categoryById,
            currency = currency,
            onEdit = { editingExpense = it },
            onDelete = { row -> scope.launch { repository.deleteExpense(row.id); sync() } },
            modifier = modifier,
            header = {
                header()
                val rows = (expenses as? SpendtrackExpensesUiState.Painted)?.rows.orEmpty()
                val spent = monthTotal(rows)
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SpendtrackTotalCard(total = spent, currency = currency)
                    SpendtrackBudgetCard(
                        state = budget,
                        spent = spent,
                        currency = currency,
                        month = currentMonth(),
                        onSave = { amount ->
                            scope.launch {
                                repository.setBudget(currentMonth(), amount)
                                sync()
                            }
                            true
                        },
                    )
                    SpendtrackRecurringCard(
                        state = recurring,
                        categories = categoryRows,
                        currency = currency,
                        onDelete = { row -> scope.launch { repository.deleteRecurring(row.id); sync() } },
                        onEdit = { row -> recurringForm = SpendtrackRecurringTarget.Edit(row) },
                        onAdd = { recurringForm = SpendtrackRecurringTarget.New },
                    )
                }
            },
        )
    }

    val editing = editingExpense
    if (addingExpense || editing != null) {
        androidx.compose.ui.window.Dialog(
            onDismissRequest = {
                addingExpense = false
                editingExpense = null
            }
        ) {
            SpendtrackExpenseDialog(
                editing = editing,
                categories = categoryRows,
                currency = currency,
                onDismiss = {
                    addingExpense = false
                    editingExpense = null
                },
                onSave = { amount, categoryId, date, description, chosenCurrency ->
                    // The write commits before this repaints, so the list never
                    // shows a state the store does not hold. It is launched
                    // rather than awaited because the dialog's callback is not a
                    // coroutine: the store transaction is the next frame, and
                    // the paint that follows it is [sync]'s.
                    scope.launch {
                        if (editing == null) {
                            repository.createExpense(
                                amount,
                                categoryId,
                                date,
                                description,
                                chosenCurrency,
                            )
                        } else {
                            repository.updateExpense(
                                editing.id,
                                amount,
                                categoryId,
                                date,
                                description,
                                chosenCurrency,
                            )
                        }
                        sync()
                    }
                    true
                },
            )
        }
    }

    categoryForm?.let { target ->
        androidx.compose.ui.window.Dialog(onDismissRequest = { categoryForm = null }) {
            SpendtrackCategoryDialog(
                editing = (target as? SpendtrackCategoryFormTarget.Edit)?.row,
                onDismiss = { categoryForm = null },
                onSave = { name, colorHex ->
                    scope.launch {
                        if (target is SpendtrackCategoryFormTarget.Edit) {
                            repository.updateCategory(target.row.id, name, colorHex)
                        } else {
                            repository.createCategory(name, colorHex)
                        }
                        sync()
                    }
                    true
                },
            )
        }
    }


    recurringForm?.let { target ->
        val editing = (target as? SpendtrackRecurringTarget.Edit)?.row
        SpendtrackRecurringDialog(
            editing = editing,
            categories = categoryRows,
            onDismiss = { recurringForm = null },
            onSave = { amount, categoryId, dayOfMonth, description ->
                scope.launch {
                    if (editing == null) {
                        repository.createRecurring(
                            amount = amount,
                            categoryId = categoryId,
                            dayOfMonth = dayOfMonth,
                            startMonth = currentMonth(),
                            description = description,
                        )
                    } else {
                        repository.updateRecurring(
                            id = editing.id,
                            amount = amount,
                            categoryId = categoryId,
                            dayOfMonth = dayOfMonth,
                            startMonth = editing.startMonth,
                            description = description,
                        )
                    }
                    sync()
                }
                true
            },
        )
    }
}

/** Which recurring form is open: a new schedule, or an existing one. */
private sealed interface SpendtrackRecurringTarget {
    data object New : SpendtrackRecurringTarget

    data class Edit(val row: SpendtrackRecurringRow) : SpendtrackRecurringTarget
}

/** Which category dialog is open: a new row, or an existing one. */
private sealed interface SpendtrackCategoryFormTarget {
    data object New : SpendtrackCategoryFormTarget

    data class Edit(val row: SpendtrackCategoryRow) : SpendtrackCategoryFormTarget
}

/** The screen's title row: the destination's name, the add action and the pill. */
@Composable
private fun SpendtrackHeader(
    route: String,
    pill: SyncPillState?,
    onRetry: () -> Unit,
    onAdd: () -> Unit,
    onOpenCategories: () -> Unit,
) {
    val categoriesRoute = route == CATEGORIES_ROUTE

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text =
                    if (categoriesRoute) SpendtrackCategoriesCopy.LIST_LABEL
                    else ServicesCopy.SPEND_TRACK,
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (categoriesRoute) {
                SpendtrackAddCategoryButton(onClick = onAdd)
            } else {
                SpendtrackAddExpenseButton(onClick = onAdd)
            }
        }

        if (!categoriesRoute) {
            TextButton(onClick = onOpenCategories) {
                Text(SpendtrackCategoriesCopy.LIST_LABEL)
            }
        }

        pill?.let { SyncPill(state = it, onRetry = onRetry) }
    }
}

/** The month the screen is about, in the device's zone: `yyyy-MM`. */
internal fun currentMonth(): String {
    val calendar = java.util.Calendar.getInstance()
    return String.format(
        java.util.Locale.ROOT,
        "%04d-%02d",
        calendar.get(java.util.Calendar.YEAR),
        calendar.get(java.util.Calendar.MONTH) + 1,
    )
}

/**
 * The month's total, summed from the rows the store holds.
 *
 * The site sums the filtered window it is drawing (`totalExpenses`); the app has
 * no filter bar yet, so its window is the current month, which is the default
 * the site opens on. A tombstoned or other month's row is not in the list it
 * would count either.
 */
internal fun monthTotal(rows: List<SpendtrackExpenseRow>, month: String = currentMonth()): Double =
    rows.filter { it.date.startsWith(month) }.sumOf { it.amount }

/** The categories route, spelled once. */
const val CATEGORIES_ROUTE = "/spendtrack/categories"
