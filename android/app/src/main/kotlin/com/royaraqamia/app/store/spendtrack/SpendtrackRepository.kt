package com.royaraqamia.app.store.spendtrack

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.SpendtrackBudgetWrite
import com.royaraqamia.app.contracts.generated.SpendtrackCurrency
import com.royaraqamia.app.contracts.generated.SpendtrackRecurringUpdate
import com.royaraqamia.app.contracts.generated.SpendtrackRecurringWrite
import com.royaraqamia.app.contracts.generated.SpendtrackExpenseWriteSplitsItem
import com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshot
import com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshotCategoriesItem
import com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshotBudgetsItem
import com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshotExpensesItem
import com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshotRecurringItem
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.outbox.ConflictWinner
import com.royaraqamia.app.store.outbox.DrainReport
import com.royaraqamia.app.store.outbox.OutboxDrainer
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.OutboxQueue
import com.royaraqamia.app.store.outbox.OutboxRules
import com.royaraqamia.app.store.outbox.SendOutcome
import com.royaraqamia.app.store.outbox.SystemWriteClock
import com.royaraqamia.app.store.outbox.WriteClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * SpendTrack's store, as the screen uses it (#653), and its Outbox.
 *
 * The split between the operations is the point, and it is HabitFlow's (#650)
 * rather than a second opinion about it:
 *
 * - [expenses] and [categories] answer from the database and nothing else. No
 *   session, no socket, no refresh: an expired token cannot delay a paint, and a
 *   cold launch with the radio off paints the rows the last pull wrote.
 * - [createExpense], [updateExpense], [deleteExpense] and the category writes put
 *   the row **and** its replay intent in one transaction, so a write is durable
 *   before anything is sent. The screen paints the row immediately and the intent
 *   is what reaches the server later — after a kill, a reboot or a week offline.
 * - [drain] is the only code that sends a queued write, through the same
 *   [com.royaraqamia.app.store.outbox.OutboxDrainer] HabitFlow drains with.
 * - [pull] is the only code that writes server rows, and it is pending-aware: a
 *   row with a queued intent is left alone (ADR-0029). It also reads the
 *   account's currency, which is the symbol every amount on the screen is drawn
 *   with.
 *
 * Identity comes from a lambda rather than a stored field so that a sign-out
 * inside the process changes which database the next call opens
 * ([IdentityScopedStore]). The queue is rows in that identity's own file, so an
 * intent is drained by the identity that queued it and by no other.
 */
class SpendtrackRepository(
    private val databases: IdentityScopedStore<SpendtrackStores>,
    private val identity: () -> Identity,
    private val client: ApiClient,
    /** Whether a request can be sent now; guest queues never drain (ADR-0027). */
    private val signedIn: () -> Boolean = { true },
    /** Whether the radio is on. Injected so the JVM suite can pin a drain. */
    private val online: () -> Boolean = { true },
    private val clock: WriteClock = SystemWriteClock,
    private val random: () -> Double = { Math.random() },
    private val nowMillis: () -> Long = { System.currentTimeMillis() },
) {
    /** One drain at a time, so two triggers cannot race for the same `seq`. */
    private val drainMutex = Mutex()

    /** The rows the list paints, newest day first, tombstones excluded. */
    suspend fun expenses(): List<SpendtrackExpenseRow> =
        withContext(Dispatchers.IO) { dao().expenses() }

    /** The categories the pickers and the list read, by name. */
    suspend fun categories(): List<SpendtrackCategoryRow> =
        withContext(Dispatchers.IO) { dao().categories() }

    /** The account's display currency, as the last pull read it; null before the first. */
    suspend fun currency(): String? = withContext(Dispatchers.IO) { dao().meta(KEY_CURRENCY) }

    /** The month's own budget (not a category's), or null when none is set. */
    suspend fun budget(month: String): SpendtrackBudgetRow? = withContext(Dispatchers.IO) {
        dao().budgets(month).firstOrNull { it.categoryId == null }
    }

    /** Every budget row the month carries, including its categories'. */
    suspend fun budgets(month: String): List<SpendtrackBudgetRow> =
        withContext(Dispatchers.IO) { dao().budgets(month) }

    /** The recurring expenses, by the day they fall on. */
    suspend fun recurring(): List<SpendtrackRecurringRow> =
        withContext(Dispatchers.IO) { dao().recurring() }

    /** The day a new expense is dated, in the device's own zone. */
    fun today(): String = clock.today()

    /**
     * Adds an expense: the row and its `expense.create` intent commit together,
     * so the tap is durable even if the process dies in the next millisecond.
     *
     * `clientId` is the row's own id, which is what makes the replay an upsert —
     * the site adopts it as the primary key (`sync-transport.ts`).
     */
    suspend fun createExpense(
        amount: Double,
        categoryId: String,
        date: String,
        description: String?,
        currency: String? = null,
    ): SpendtrackExpenseRow = withContext(Dispatchers.IO) {
        require(amount > 0) { "an expense needs an amount above zero" }
        require(categoryId.isNotBlank()) { "an expense needs a category" }
        val dao = dao()
        val now = clock.nowIso()
        val id = clock.uuid()
        val row =
            SpendtrackExpenseRow(
                id = id,
                categoryId = categoryId,
                amount = amount,
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                date = date,
                currency = currency,
                createdAt = now,
                splits = null,
                clientId = id,
                updatedAt = now,
                deletedAt = null,
            )
        dao.commitExpense(row, expenseIntent("expense.create", row, now))
        row
    }

    /**
     * Edits an owned expense. The splits the server last sent travel back
     * untouched: this screen has no split editor, and a write that dropped them
     * would delete another device's work.
     */
    suspend fun updateExpense(
        id: String,
        amount: Double,
        categoryId: String,
        date: String,
        description: String?,
        currency: String? = null,
    ): SpendtrackExpenseRow? = withContext(Dispatchers.IO) {
        require(amount > 0) { "an expense needs an amount above zero" }
        val dao = dao()
        val existing = dao.expense(id) ?: return@withContext null
        val now = clock.nowIso()
        val row =
            existing.copy(
                amount = amount,
                categoryId = categoryId,
                date = date,
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                currency = currency,
                updatedAt = now,
                deletedAt = null,
            )
        dao.commitExpense(row, expenseIntent("expense.update", row, now))
        row
    }

    /** Tombstones an expense: a removal, not a row the next pull re-creates. */
    suspend fun deleteExpense(id: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.expense(id) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitExpense(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("expense", "expense.delete", SpendtrackPayloads.delete(id, now), now),
        )
        true
    }

    /** Adds a category: the row and its `category.create` intent, one transaction. */
    suspend fun createCategory(name: String, colorHex: String): SpendtrackCategoryRow =
        withContext(Dispatchers.IO) {
            require(name.isNotBlank()) { "a category needs a name" }
            val dao = dao()
            val now = clock.nowIso()
            val id = clock.uuid()
            val row =
                SpendtrackCategoryRow(
                    id = id,
                    userId = userId(),
                    name = name.trim(),
                    colorHex = colorHex,
                    createdAt = now,
                    clientId = id,
                    updatedAt = now,
                    deletedAt = null,
                )
            dao.commitCategory(
                row,
                intent(
                    entity = "category",
                    type = "category.create",
                    payload =
                        SpendtrackPayloads.createCategory(
                            clientId = id,
                            name = row.name,
                            colorHex = row.colorHex,
                            updatedAt = now,
                        ),
                    createdAt = now,
                ),
            )
            row
        }

    /** Edits an owned category; a default row (no account) is not editable here. */
    suspend fun updateCategory(id: String, name: String, colorHex: String): SpendtrackCategoryRow? =
        withContext(Dispatchers.IO) {
            require(name.isNotBlank()) { "a category needs a name" }
            val dao = dao()
            val existing = dao.category(id) ?: return@withContext null
            if (existing.userId == null) return@withContext null
            val now = clock.nowIso()
            val row = existing.copy(name = name.trim(), colorHex = colorHex, updatedAt = now)
            dao.commitCategory(
                row,
                intent(
                    entity = "category",
                    type = "category.update",
                    payload =
                        SpendtrackPayloads.updateCategory(
                            id = id,
                            name = row.name,
                            colorHex = row.colorHex,
                            updatedAt = now,
                        ),
                    createdAt = now,
                ),
            )
            row
        }

    /** Tombstones an owned category. A default row belongs to nobody and stays. */
    suspend fun deleteCategory(id: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.category(id) ?: return@withContext false
        if (existing.userId == null) return@withContext false
        val now = clock.nowIso()
        dao.commitCategory(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("category", "category.delete", SpendtrackPayloads.delete(id, now), now),
        )
        true
    }

    /**
     * Sets the month's budget (#653).
     *
     * The row and its `budget.set` intent commit together. No `clientId`
     * travels: the server keys a budget on `(user_id, month, category_id)`, so a
     * replay lands on the row it already made without one.
     */
    suspend fun setBudget(month: String, amount: Double): SpendtrackBudgetRow =
        withContext(Dispatchers.IO) {
            require(amount > 0) { "a budget needs an amount above zero" }
            val dao = dao()
            val now = clock.nowIso()
            val id = budgetKey(month, null)
            val row =
                SpendtrackBudgetRow(
                    id = id,
                    month = month,
                    amount = amount,
                    categoryId = null,
                    clientId = null,
                    updatedAt = now,
                    deletedAt = null,
                )
            dao.commitBudget(
                row,
                intent(
                    entity = "budget",
                    type = "budget.set",
                    payload =
                        SpendtrackPayloads.setBudget(
                            month = month,
                            amount = amount,
                            categoryId = null,
                            updatedAt = now,
                        ),
                    createdAt = now,
                ),
            )
            row
        }

    /** Tombstones the month's budget, so the next pull does not resurrect it. */
    suspend fun deleteBudget(month: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.budget(budgetKey(month, null)) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitBudget(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("budget", "budget.delete", SpendtrackPayloads.deleteBudget(month, null, now), now),
        )
        true
    }

    /** Adds a recurring expense: the row and its `recurring.create` intent, together. */
    suspend fun createRecurring(
        amount: Double,
        categoryId: String,
        dayOfMonth: Long,
        startMonth: String,
        description: String?,
    ): SpendtrackRecurringRow = withContext(Dispatchers.IO) {
        require(amount > 0) { "a recurring expense needs an amount above zero" }
        require(dayOfMonth in 1..31) { "a recurring expense needs a day of the month" }
        val dao = dao()
        val now = clock.nowIso()
        val id = clock.uuid()
        val row =
            SpendtrackRecurringRow(
                id = id,
                amount = amount,
                categoryId = categoryId,
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                dayOfMonth = dayOfMonth,
                startMonth = startMonth,
                active = true,
                clientId = id,
                updatedAt = now,
                deletedAt = null,
            )
        dao.commitRecurring(
            row,
            intent(
                entity = "recurring",
                type = "recurring.create",
                payload =
                    SpendtrackPayloads.createRecurring(
                        clientId = id,
                        amount = amount,
                        categoryId = categoryId,
                        description = row.description,
                        dayOfMonth = dayOfMonth,
                        startMonth = startMonth,
                        updatedAt = now,
                    ),
                createdAt = now,
            ),
        )
        row
    }

    /** Edits an owned recurring expense. */
    suspend fun updateRecurring(
        id: String,
        amount: Double,
        categoryId: String,
        dayOfMonth: Long,
        startMonth: String,
        description: String?,
    ): SpendtrackRecurringRow? = withContext(Dispatchers.IO) {
        require(amount > 0) { "a recurring expense needs an amount above zero" }
        require(dayOfMonth in 1..31) { "a recurring expense needs a day of the month" }
        val dao = dao()
        val existing = dao.recurringRow(id) ?: return@withContext null
        val now = clock.nowIso()
        val row =
            existing.copy(
                amount = amount,
                categoryId = categoryId,
                dayOfMonth = dayOfMonth,
                startMonth = startMonth,
                description = description?.trim()?.takeIf { it.isNotEmpty() },
                updatedAt = now,
                deletedAt = null,
            )
        dao.commitRecurring(
            row,
            intent(
                entity = "recurring",
                type = "recurring.update",
                payload =
                    SpendtrackPayloads.updateRecurring(
                        id = id,
                        amount = amount,
                        categoryId = categoryId,
                        description = row.description,
                        dayOfMonth = dayOfMonth,
                        startMonth = startMonth,
                        updatedAt = now,
                    ),
                createdAt = now,
            ),
        )
        row
    }

    /** Tombstones an owned recurring expense. */
    suspend fun deleteRecurring(id: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.recurringRow(id) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitRecurring(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("recurring", "recurring.delete", SpendtrackPayloads.delete(id, now), now),
        )
        true
    }

    /**
     * Replays the queue once (#653).
     *
     * The DAO is resolved **once**, for the identity the drain started under, and
     * every removal goes through it: resolving it per intent would reopen the
     * store under a new identity mid-run and delete another account's `seq`. A
     * sign-out during the run stops it instead.
     */
    suspend fun drain(): DrainReport = withContext(Dispatchers.IO) {
        drainMutex.withLock {
            val expected = identity()
            val dao = databases.forIdentity(expected).dao()
            val queue =
                object : OutboxQueue {
                    override suspend fun entries(): List<OutboxIntentRow> = dao.outbox()

                    override suspend fun remove(seq: Long) = dao.deleteIntent(seq)

                    override suspend fun patch(
                        entry: OutboxIntentRow,
                        attempts: Int,
                        status: String,
                        lastError: String?,
                        nextAttemptAt: Long,
                    ) = dao.patchIntent(entry.seq, attempts, status, lastError, nextAttemptAt)
                }
            OutboxDrainer(
                queue = queue,
                send = ::send,
                signedIn = signedIn,
                online = online,
                now = nowMillis,
                random = random,
                stillOurs = { identity() == expected },
            ).drain()
        }
    }

    /** A manual retry: every failed intent is re-armed, then the queue drains. */
    suspend fun retryFailed(): DrainReport = withContext(Dispatchers.IO) {
        dao().retryFailedIntents()
        drain()
    }

    /** Pending work as the pill reports it, without sending anything. */
    suspend fun outboxStatus(): DrainReport = withContext(Dispatchers.IO) {
        val dao = dao()
        DrainReport(
            replayed = 0,
            pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
            failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
        )
    }

    /**
     * Writes the server's page into the store, pending-aware (#653).
     *
     * Each row is a conflict between the server's copy and this device's, and
     * [OutboxRules.conflictWinner] answers it: a queued intent keeps the local
     * row (it is about to be told to the server), otherwise last write wins on
     * `updatedAt` with ties going to the device. Tombstones are written like any
     * other row, so a delete made elsewhere lands here instead of being
     * invisible.
     *
     * The cursor advances only when nothing was held back: a page that skipped a
     * row has to be able to fetch it again, or the two sides stop converging
     * (#313's rule, which the web's store implements the same way).
     */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        val since = dao().meta(KEY_CURSOR)
        val path = if (since.isNullOrEmpty()) SYNC_PATH else "$SYNC_PATH?since=$since"

        when (val answer = client.get<SpendtrackSyncSnapshot>(path)) {
            is ApiResult.Success -> {
                val body = answer.value
                val dao = dao()
                val pending = dao.outbox()
                val pendingCategories =
                    pending.filter { it.entity == "category" }
                        .mapNotNull { payloadString(it.payload, "id") ?: payloadString(it.payload, "clientId") }
                        .toSet()
                val pendingExpenses =
                    pending.filter { it.entity == "expense" }
                        .mapNotNull { payloadString(it.payload, "id") ?: payloadString(it.payload, "clientId") }
                        .toSet()
                val pendingBudgets =
                    pending.filter { it.entity == "budget" }
                        .mapNotNull { intent ->
                            val month = payloadString(intent.payload, "month") ?: return@mapNotNull null
                            budgetKey(month, payloadString(intent.payload, "categoryId"))
                        }
                        .toSet()
                val pendingRecurring =
                    pending.filter { it.entity == "recurring" }
                        .mapNotNull { payloadString(it.payload, "id") ?: payloadString(it.payload, "clientId") }
                        .toSet()

                val localCategories = dao.allCategories().associateBy { it.id }
                val localExpenses = dao.allExpenses().associateBy { it.id }
                val localBudgets = dao.allBudgets().associateBy { it.id }
                val localRecurring = dao.allRecurring().associateBy { it.id }

                var skipped = 0
                val categories =
                    body.categories.mapNotNull { server ->
                        val local = localCategories[server.id]
                        if (pendingCategories.contains(server.id)) {
                            skipped += 1
                            return@mapNotNull null
                        }
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = local?.updatedAt,
                                serverUpdatedAt = server.updatedAt,
                                pending = false,
                            )
                        if (winner == ConflictWinner.Server) server.toRow() else null
                    }
                val expenses =
                    body.expenses.mapNotNull { server ->
                        val local = localExpenses[server.id]
                        if (pendingExpenses.contains(server.id)) {
                            skipped += 1
                            return@mapNotNull null
                        }
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = local?.updatedAt,
                                serverUpdatedAt = server.updatedAt,
                                pending = false,
                            )
                        if (winner == ConflictWinner.Server) server.toRow() else null
                    }

                val budgets =
                    body.budgets.mapNotNull { server ->
                        // A budget is keyed locally on its month and category, not
                        // on the server's id: that is the pair the web's store
                        // keys on, and the pair the route updates.
                        val key = budgetKey(server.month, server.category_id)
                        if (pendingBudgets.contains(key)) {
                            skipped += 1
                            return@mapNotNull null
                        }
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = localBudgets[key]?.updatedAt,
                                serverUpdatedAt = server.updatedAt,
                                pending = false,
                            )
                        if (winner == ConflictWinner.Server) server.toRow() else null
                    }
                val recurring =
                    body.recurring.mapNotNull { server ->
                        if (pendingRecurring.contains(server.id)) {
                            skipped += 1
                            return@mapNotNull null
                        }
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = localRecurring[server.id]?.updatedAt,
                                serverUpdatedAt = server.updatedAt,
                                pending = false,
                            )
                        if (winner == ConflictWinner.Server) server.toRow() else null
                    }

                dao.apply(categories, expenses, budgets, recurring)
                if (skipped == 0 && body.cursor != null) {
                    dao.putMeta(SpendtrackMetaRow(KEY_CURSOR, body.cursor))
                }
                readCurrency(dao)
                ApiResult.Success(
                    body.categories.size + body.expenses.size + body.budgets.size + body.recurring.size
                )
            }
            // A failed pull is passed through as it is: the screen decides what
            // "needs connection" looks like, and it cannot do that if this
            // flattens a signed-out device and a server error into one answer.
            is ApiResult.Failure -> answer
        }
    }

    /**
     * The account's currency, written into the store so the next cold launch
     * draws the same symbol with the radio off. Best effort: a device that has
     * never read it draws the site's default, and the pull that can reach it
     * will.
     */
    private suspend fun readCurrency(dao: SpendtrackDao) {
        when (val answer = client.get<SpendtrackCurrency>(CURRENCY_PATH)) {
            is ApiResult.Success -> dao.putMeta(SpendtrackMetaRow(KEY_CURRENCY, answer.value.currency))
            is ApiResult.Failure -> Unit
        }
    }

    /** One intent, replayed, classified the way the web classifies it. */
    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request =
            runCatching { SpendtrackWriteTransport.requestFor(entry) }.getOrNull()
                ?: return SendOutcome.Permanent

        return when (val answer = client.send(request.method, request.path, request.body)) {
            is ApiResult.Success -> SendOutcome.Accepted
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Server -> OutboxRules.classify(error.status)
                    // No session right now is "later", not "never": the intent
                    // must survive until the next sign-in (ADR-0027).
                    ApiError.NotSignedIn -> SendOutcome.Transient
                    is ApiError.Network -> SendOutcome.Transient
                    is ApiError.InvalidContract -> SendOutcome.Permanent
                }
        }
    }

    /** The intent an expense row replays as: create and update differ only by type. */
    private fun expenseIntent(
        type: String,
        row: SpendtrackExpenseRow,
        updatedAt: String,
    ): OutboxIntentRow {
        val payload =
            if (type == "expense.create") {
                SpendtrackPayloads.createExpense(
                    clientId = row.clientId ?: row.id,
                    amount = row.amount,
                    categoryId = row.categoryId,
                    date = row.date,
                    description = row.description,
                    currency = row.currency,
                    splits = row.splitItems(),
                    updatedAt = updatedAt,
                )
            } else {
                SpendtrackPayloads.updateExpense(
                    id = row.id,
                    clientId = row.clientId ?: row.id,
                    amount = row.amount,
                    categoryId = row.categoryId,
                    date = row.date,
                    description = row.description,
                    currency = row.currency,
                    splits = row.splitItems(),
                    updatedAt = updatedAt,
                )
            }
        return intent("expense", type, payload, updatedAt)
    }

    private fun intent(
        entity: String,
        type: String,
        payload: String,
        createdAt: String,
    ): OutboxIntentRow =
        OutboxIntentRow.pending(
            id = clock.uuid(),
            entity = entity,
            type = type,
            payload = payload,
            createdAt = nowMillis(),
        )

    /** The account an owned row belongs to, or null for a guest's namespace. */
    private fun userId(): String? = (identity() as? Identity.User)?.id

    private fun dao(): SpendtrackDao = databases.forIdentity(identity()).dao()

    private fun payloadString(payload: String, key: String): String? =
        runCatching {
            SpendtrackPayloads.withNulls
                .parseToJsonElement(payload)
                .jsonObject[key]
                ?.jsonPrimitive
                ?.content
        }.getOrNull()

    companion object {
        /** The route both clients pull from. */
        const val SYNC_PATH = "/spendtrack/api/sync"

        /** The account's display currency. */
        const val CURRENCY_PATH = "/spendtrack/api/settings/currency"

        /** Where the incremental cursor lives beside the rows. */
        const val KEY_CURSOR = "syncCursor"

        /** Where the account's currency lives, so a cold launch draws the same symbol. */
        const val KEY_CURRENCY = "currency"
    }
}

/** The splits the server last sent, as the write type carries them back. */
fun SpendtrackExpenseRow.splitItems(): List<SpendtrackExpenseWriteSplitsItem> {
    val json = splits ?: return emptyList()
    return runCatching {
        SpendtrackPayloads.withNulls.decodeFromString<List<SpendtrackExpenseWriteSplitsItem>>(json)
    }.getOrDefault(emptyList())
}

/** The contract's category as the store holds it. */
fun SpendtrackSyncSnapshotCategoriesItem.toRow(): SpendtrackCategoryRow =
    SpendtrackCategoryRow(
        id = id,
        userId = user_id,
        name = name,
        colorHex = colorHex,
        createdAt = created_at,
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

/**
 * The contract's expense as the store holds it.
 *
 * The category name the body carries is dropped: the screen joins it from the
 * store's own categories, which is the copy this device can actually trust
 * offline. The splits are kept as the JSON they arrived as, so an edit here
 * re-sends them untouched.
 */
fun SpendtrackSyncSnapshotExpensesItem.toRow(): SpendtrackExpenseRow =
    SpendtrackExpenseRow(
        id = id,
        categoryId = category_id,
        amount = amount,
        description = description,
        date = date,
        currency = currency,
        createdAt = created_at,
        splits = splits?.let { SpendtrackPayloads.withNulls.encodeToString(it.map(::toSplitWrite)) },
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

private fun toSplitWrite(
    split: com.royaraqamia.app.contracts.generated.SpendtrackSyncSnapshotExpensesItemSplitsItem
): SpendtrackExpenseWriteSplitsItem =
    SpendtrackExpenseWriteSplitsItem(
        category_id = split.category_id,
        amount = split.amount,
        clientId = split.clientId,
    )

/** The contract's budget as the store holds it, keyed on the pair the route uses. */
fun SpendtrackSyncSnapshotBudgetsItem.toRow(): SpendtrackBudgetRow =
    SpendtrackBudgetRow(
        id = budgetKey(month, category_id),
        month = month,
        amount = amount,
        categoryId = category_id,
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

/** The contract's recurring expense as the store holds it. */
fun SpendtrackSyncSnapshotRecurringItem.toRow(): SpendtrackRecurringRow =
    SpendtrackRecurringRow(
        id = id,
        amount = amount,
        categoryId = category_id,
        description = description,
        dayOfMonth = day_of_month,
        startMonth = start_month,
        active = active,
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )
