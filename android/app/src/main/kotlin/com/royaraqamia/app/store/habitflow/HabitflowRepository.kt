package com.royaraqamia.app.store.habitflow

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.HabitSyncResponse
import com.royaraqamia.app.contracts.generated.HabitSyncResponseHabitsItem
import com.royaraqamia.app.contracts.generated.HabitSyncResponseLogsItem
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * HabitFlow's store, as the screen uses it (#768).
 *
 * Two operations, and the split between them is the point:
 *
 * - [rows] answers from the database and nothing else. No session, no socket, no
 *   refresh: an expired token cannot delay a paint, and a cold launch with the
 *   radio off paints the rows the last pull wrote. That is the criterion the
 *   ticket exists for.
 * - [pull] is the only writer, and it reads the route the web's pull reads
 *   (`GET /habitflow/api/sync`, tombstone-inclusive). Its failure is a value the
 *   screen may show as "needs connection"; it never clears what is stored.
 *
 * Identity comes from a lambda rather than a stored field so that a sign-out
 * inside the process changes which database the next read opens, and so that a
 * store's lifetime is decided in one place ([IdentityScopedStore]).
 *
 * Pending writes are not part of this yet: the app holds none until #650 lands,
 * at which point [pull] has to skip a row a queued intent still owns instead of
 * overwriting it (the web's merge is pending-aware, ADR-0029).
 */
class HabitflowRepository(
    private val databases: IdentityScopedStore<HabitStores>,
    private val identity: () -> Identity,
    private val client: ApiClient,
) {
    /** The rows the list paints, oldest first, tombstones excluded. */
    suspend fun rows(): List<HabitRow> =
        withContext(Dispatchers.IO) { dao().habits() }

    /** The logs behind those rows, for the calendar the next screen draws. */
    suspend fun logs(): List<HabitLogRow> =
        withContext(Dispatchers.IO) { dao().logs() }

    /** Writes the server's snapshot into the store, in one transaction. */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        when (val answer = client.get<HabitSyncResponse>(SYNC_PATH)) {
            is ApiResult.Success -> {
                val body = answer.value
                dao().apply(body.habits.map { it.toRow() }, body.logs.map { it.toRow() })
                ApiResult.Success(body.habits.size + body.logs.size)
            }
            // A failed pull is passed through as it is: the screen decides what
            // "needs connection" looks like, and it cannot do that if this
            // flattens a signed-out device and a server error into one answer.
            is ApiResult.Failure -> answer
        }
    }

    private fun dao(): HabitDao = databases.forIdentity(identity()).dao()

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

/** The contract's log as the store holds it. */
fun HabitSyncResponseLogsItem.toRow(): HabitLogRow =
    HabitLogRow(
        id = id,
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
