package com.royaraqamia.app.store.habitflow

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.HabitSyncResponse
import com.royaraqamia.app.contracts.generated.HabitSyncResponseHabitsItem
import com.royaraqamia.app.contracts.generated.HabitSyncResponseLogsItem
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * HabitFlow's store, as the screen uses it (#768), and its Outbox (#650).
 *
 * The split between the operations is the point:
 *
 * - [rows] and [logs] answer from the database and nothing else. No session, no
 *   socket, no refresh: an expired token cannot delay a paint, and a cold launch
 *   with the radio off paints the rows the last pull wrote.
 * - [addHabit], [toggleLog] and [deleteHabit] write the row **and** its replay
 *   intent in one transaction, so a write is durable before anything is sent. The
 *   screen paints the row immediately and the intent is what makes it reach the
 *   server later — after a kill, a reboot or a week offline.
 * - [drain] is the only code that sends a queued write, and it replays to the
 *   endpoints the web's outbox already drains to ([HabitWriteTransport]).
 * - [pull] is the only code that writes server rows, and it is pending-aware: a
 *   row with a queued intent is left alone (ADR-0029).
 *
 * Identity comes from a lambda rather than a stored field so that a sign-out
 * inside the process changes which database the next call opens, and so that a
 * store's lifetime is decided in one place ([IdentityScopedStore]). The queue is
 * rows in that identity's own file, so an intent is drained by the identity that
 * queued it and by no other; a sign-out closes the connection and keeps them.
 */
class HabitflowRepository(
    private val databases: IdentityScopedStore<HabitStores>,
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

    /** The rows the list paints, oldest first, tombstones excluded. */
    suspend fun rows(): List<HabitRow> =
        withContext(Dispatchers.IO) { dao().habits() }

    /** The logs behind those rows, for the calendar the next screen draws. */
    suspend fun logs(): List<HabitLogRow> =
        withContext(Dispatchers.IO) { dao().logs() }

    /** Today's logs, keyed by habit: the list asks only about the day it shows. */
    suspend fun logsToday(): Map<String, HabitLogRow> = withContext(Dispatchers.IO) {
        dao().logsOn(clock.today()).associateBy { it.habitId }
    }

    /** The day a toggle is about, in the device's own zone. */
    fun today(): String = clock.today()

    /**
     * Adds a habit (#650): the row and its `habit.create` intent commit together,
     * so the tap is durable even if the process dies in the next millisecond.
     */
    suspend fun addHabit(name: String): HabitRow = withContext(Dispatchers.IO) {
        require(name.isNotBlank()) { "a habit needs a name" }
        val dao = dao()
        val now = clock.nowIso()
        val id = clock.uuid()
        val row = HabitRow(
            id = id,
            name = name.trim(),
            frequency = "daily",
            createdAt = now,
            archived = false,
            target = null,
            targetPeriod = null,
            reminderTime = null,
            clientId = id,
            updatedAt = now,
            deletedAt = null,
        )
        dao.commitHabit(row, intent("habit", "habit.create", WritePayloads.createHabit(id, row.name, now)))
        row
    }

    /**
     * Records today's state of a habit (#650). The log is keyed on
     * `(habitId, date)` the way the server keys it, and a replay carries the
     * row's own `clientId`, so toggling twice before the radio returns is one row
     * with two intents that the server applies in order.
     */
    suspend fun toggleLog(habitId: String, date: String, completed: Boolean): HabitLogRow =
        withContext(Dispatchers.IO) {
            val dao = dao()
            val now = clock.nowIso()
            val existing = dao.log(habitId, date)
            val log =
                if (existing == null) {
                    val id = clock.uuid()
                    HabitLogRow(
                        id = id,
                        habitId = habitId,
                        date = date,
                        completed = completed,
                        completedAt = if (completed) now else null,
                        kind = if (completed) "complete" else null,
                        note = null,
                        clientId = id,
                        updatedAt = now,
                        deletedAt = null,
                    )
                } else {
                    existing.copy(
                        completed = completed,
                        completedAt = if (completed) now else null,
                        kind = if (completed) "complete" else null,
                        updatedAt = now,
                        deletedAt = null,
                    )
                }
            val clientId = log.clientId ?: log.id
            dao.commitLog(
                log,
                intent(
                    entity = "habit_log",
                    type = "log.toggle",
                    payload = WritePayloads.toggleLog(clientId, habitId, date, completed, now),
                ),
            )
            log
        }

    /** Tombstones a habit (#650): a removal, not a row the next pull re-creates. */
    suspend fun deleteHabit(id: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.habit(id) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitHabit(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("habit", "habit.delete", WritePayloads.deleteHabit(id, now)),
        )
        true
    }

    /**
     * Replays the queue once (#650).
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

    /**
     * Pending work as the pill reports it, without sending anything.
     */
    suspend fun outboxStatus(): DrainReport = withContext(Dispatchers.IO) {
        val dao = dao()
        DrainReport(
            replayed = 0,
            pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
            failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
        )
    }

    /**
     * Writes the server's snapshot into the store, pending-aware (#650).
     *
     * Each row is a conflict between the server's copy and this device's, and
     * [OutboxRules.conflictWinner] answers it: a queued intent keeps the local
     * row (it is about to be told to the server), otherwise last write wins on
     * `updatedAt` with ties going to the device. Tombstones are written like any
     * other row — the route is tombstone-inclusive (ADR-0029) — so a delete made
     * elsewhere lands here instead of being invisible.
     */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        when (val answer = client.get<HabitSyncResponse>(SYNC_PATH)) {
            is ApiResult.Success -> {
                val body = answer.value
                val dao = dao()
                val pending = dao.outbox()
                val pendingHabitIds = pending
                    .filter { it.entity == "habit" }
                    .mapNotNull { payloadString(it.payload, "id") ?: payloadString(it.payload, "clientId") }
                    .toSet()
                val pendingLogKeys = pending
                    .filter { it.entity == "habit_log" }
                    .mapNotNull { intent ->
                        val habitId = payloadString(intent.payload, "habitId")
                        val date = payloadString(intent.payload, "date")
                        if (habitId == null || date == null) null else "$habitId#$date"
                    }
                    .toSet()

                val localHabits = dao.allHabits().associateBy { it.id }
                val localLogs = dao.allLogs().associateBy { "${it.habitId}#${it.date}" }

                val habits = body.habits.mapNotNull { server ->
                    val local = localHabits[server.id]
                    val winner =
                        OutboxRules.conflictWinner(
                            localUpdatedAt = local?.updatedAt,
                            serverUpdatedAt = server.updatedAt,
                            pending = pendingHabitIds.contains(server.id),
                        )
                    if (winner == ConflictWinner.Server) server.toRow() else null
                }
                val logs = body.logs.mapNotNull { server ->
                    val key = "${server.habitId}#${server.date}"
                    val local = localLogs[key]
                    val winner =
                        OutboxRules.conflictWinner(
                            localUpdatedAt = local?.updatedAt,
                            serverUpdatedAt = server.updatedAt,
                            pending = pendingLogKeys.contains(key),
                        )
                    if (winner == ConflictWinner.Server) server.toRow(local?.id) else null
                }

                dao.apply(habits, logs)
                ApiResult.Success(body.habits.size + body.logs.size)
            }
            // A failed pull is passed through as it is: the screen decides what
            // "needs connection" looks like, and it cannot do that if this
            // flattens a signed-out device and a server error into one answer.
            is ApiResult.Failure -> answer
        }
    }

    /** One intent, replayed, classified the way the web classifies it. */
    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request =
            runCatching { HabitWriteTransport.requestFor(entry) }.getOrNull()
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

    private fun intent(entity: String, type: String, payload: String): OutboxIntentRow =
        OutboxIntentRow.pending(
            id = clock.uuid(),
            entity = entity,
            type = type,
            payload = payload,
            createdAt = nowMillis(),
        )

    private fun dao(): HabitDao = databases.forIdentity(identity()).dao()

    private fun payloadString(payload: String, key: String): String? =
        runCatching {
            WritePayloads.withoutNulls.parseToJsonElement(payload).jsonObject[key]?.jsonPrimitive?.content
        }.getOrNull()

    companion object {
        /** The route both clients pull from. */
        const val SYNC_PATH = "/habitflow/api/sync"
    }
}

/** The contract's row as the store holds it. */
fun HabitSyncResponseHabitsItem.toRow(): HabitRow =
    HabitRow(
        id = id,
        name = name,
        frequency = frequency.name.lowercase(),
        createdAt = createdAt,
        archived = archived,
        target = target,
        targetPeriod = targetPeriod?.name?.lowercase(),
        reminderTime = reminderTime,
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

/**
 * The contract's log as the store holds it.
 *
 * `localId` is the id of the row this one replaces. The store keys a log on its
 * id but the server keys it on `(habitId, date)`, so a merged row keeps the id
 * the device already had — writing it under the server's id would leave the old
 * row beside it and paint two of the same day.
 */
fun HabitSyncResponseLogsItem.toRow(localId: String? = null): HabitLogRow =
    HabitLogRow(
        id = localId ?: id,
        habitId = habitId,
        date = date,
        completed = completed,
        completedAt = completedAt,
        kind = kind?.name?.lowercase(),
        note = note,
        clientId = clientId,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )
