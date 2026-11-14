package com.royaraqamia.app.store.notes

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.NotesSyncResponse
import com.royaraqamia.app.contracts.generated.NotesSyncResponseNotesItem
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
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * Notes' store, as the screen uses it (#1390), and its Outbox (#650).
 *
 * The split between the operations is the point:
 *
 * - [rows] and [note] answer from the database and nothing else. No session, no
 *   socket, no refresh: an expired token cannot delay a paint, and a cold launch
 *   with the radio off paints the rows the last pull wrote.
 * - [createNote], [updateNote], [deleteNote] and [restoreNote] write the row
 *   **and** its replay intent in one transaction, so a write is durable before
 *   anything is sent. The screen paints the row immediately and the intent is
 *   what makes it reach the server later — after a kill, a reboot or a week
 *   offline.
 * - [drain] is the only code that sends a queued write, and it replays to the
 *   endpoints the web's outbox already drains to ([NotesWriteTransport]).
 * - [pull] is the only code that writes server rows, and it is pending-aware: a
 *   row with a queued intent is left alone (ADR-0029). The cursor advances only
 *   when the whole page was applied, so a held-back row is fetched again.
 *
 * Identity comes from a lambda rather than a stored field so that a sign-out
 * inside the process changes which database the next call opens, and so that a
 * store's lifetime is decided in one place ([IdentityScopedStore]).
 */
class NotesRepository(
    private val databases: IdentityScopedStore<NotesStores>,
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

    /** The rows the list paints, newest edit first, tombstones excluded. */
    suspend fun rows(): List<NoteRow> =
        withContext(Dispatchers.IO) { dao().notes() }

    suspend fun note(clientId: String): NoteRow? =
        withContext(Dispatchers.IO) { dao().note(clientId) }

    /** The cursor the next pull resumes from, or null before the first. */
    suspend fun cursor(): String? =
        withContext(Dispatchers.IO) { dao().meta(NoteDao.CURSOR_KEY)?.value }

    /**
     * Creates a note (#1390): the row and its `note.create` intent commit
     * together, so the tap is durable even if the process dies in the next
     * millisecond.
     */
    suspend fun createNote(body: String): NoteRow = withContext(Dispatchers.IO) {
        val dao = dao()
        val now = clock.nowIso()
        val id = clock.uuid()
        val row =
            NoteRow(
                clientId = id,
                id = id,
                body = normalizeNoteBody(body),
                createdAt = now,
                updatedAt = now,
                deletedAt = null,
            )
        dao.commit(
            row,
            intent("note", "note.create", WritePayloads.createNote(id, row.body, now, now)),
        )
        row
    }

    /** An edit: the same row, a newer stamp, and a tombstone cleared (the undo). */
    suspend fun updateNote(clientId: String, body: String): NoteRow? =
        withContext(Dispatchers.IO) {
            val dao = dao()
            val existing = dao.note(clientId) ?: return@withContext null
            val now = clock.nowIso()
            val updated =
                existing.copy(
                    body = normalizeNoteBody(body),
                    updatedAt = now,
                    deletedAt = null,
                )
            dao.commit(
                updated,
                intent(
                    entity = "note",
                    type = "note.update",
                    payload = WritePayloads.updateNote(clientId, updated.body, now),
                ),
            )
            updated
        }

    /** Tombstones a note: a removal, not a row the next pull re-creates. */
    suspend fun deleteNote(clientId: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.note(clientId) ?: return@withContext false
        val now = clock.nowIso()
        dao.commit(
            existing.copy(deletedAt = now, updatedAt = now),
            intent("note", "note.delete", WritePayloads.deleteNote(clientId, now)),
        )
        true
    }

    /** The undo path: clears the tombstone and queues a resurrect. */
    suspend fun restoreNote(clientId: String): NoteRow? = withContext(Dispatchers.IO) {
        val existing = dao().note(clientId) ?: return@withContext null
        updateNote(clientId, existing.body)
    }

    /**
     * Replays the queue once (#650).
     *
     * The DAO is resolved once, for the identity the drain started under, and
     * every removal goes through it: resolving it per intent would reopen the
     * store under a new identity mid-run and delete another account's `seq`.
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
     * Writes the server's snapshot into the store, pending-aware (#1390).
     *
     * Each row is a conflict between the server's copy and this device's, and
     * [OutboxRules.conflictWinner] answers it: a queued intent keeps the local row
     * (it is about to be told to the server), otherwise last write wins on
     * `updatedAt` with ties going to the device. Tombstones are written like any
     * other row (ADR-0029). The cursor moves only when nothing was held back, so
     * the next pull asks for the held row again.
     */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        val since = cursor()
        val path =
            if (since == null) {
                SYNC_PATH
            } else {
                "$SYNC_PATH?since=${URLEncoder.encode(since, "UTF-8")}"
            }
        when (val answer = client.get<NotesSyncResponse>(path)) {
            is ApiResult.Success -> {
                val body = answer.value
                val dao = dao()
                val pending =
                    dao.outbox()
                        .filter { it.entity == "note" }
                        .mapNotNull { clientIdOf(it.payload) }
                        .toSet()
                val local = dao.allNotes().associateBy { it.clientId }

                var skipped = 0
                val writes = mutableListOf<NoteRow>()
                for (server in body.notes) {
                    if (pending.contains(server.clientId)) {
                        skipped += 1
                        continue
                    }
                    val current = local[server.clientId]
                    val winner =
                        OutboxRules.conflictWinner(
                            localUpdatedAt = current?.updatedAt,
                            serverUpdatedAt = server.updatedAt,
                            pending = false,
                        )
                    if (winner == ConflictWinner.Server) writes.add(server.toRow())
                }

                dao.apply(writes, if (skipped == 0) body.cursor else null)
                ApiResult.Success(body.notes.size)
            }
            is ApiResult.Failure -> answer
        }
    }

    /** One intent, replayed, classified the way the web classifies it. */
    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request =
            runCatching { NotesWriteTransport.requestFor(entry) }.getOrNull()
                ?: return SendOutcome.Permanent

        return when (val answer = client.send(request.method, request.path, request.body)) {
            is ApiResult.Success -> SendOutcome.Accepted
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Server -> OutboxRules.classify(error.status)
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

    private fun dao(): NoteDao = databases.forIdentity(identity()).dao()

    private fun clientIdOf(payload: String): String? =
        runCatching {
            WritePayloads.withoutNulls
                .parseToJsonElement(payload)
                .jsonObject["clientId"]
                ?.jsonPrimitive
                ?.content
        }.getOrNull()

    companion object {
        /** The route both clients pull from. */
        const val SYNC_PATH = "/notes/api/sync"
    }
}

/** The contract's row as the store holds it. */
fun NotesSyncResponseNotesItem.toRow(): NoteRow =
    NoteRow(
        clientId = clientId,
        id = id,
        body = body,
        createdAt = createdAt,
        updatedAt = updatedAt,
        deletedAt = deletedAt,
    )

/** The body's ceiling: a very long note, still a bounded row (`shared/contracts/notes.ts`). */
const val NOTE_BODY_MAX = 100_000

/**
 * A body is kept as written apart from digit normalisation and the hard cap
 * (ADR-0136: digits are ASCII in stored content too).
 */
fun normalizeNoteBody(value: String): String =
    value.map { char ->
        when (char) {
            in '\u0660'..'\u0669' -> '0' + (char - '\u0660')
            in '\u06F0'..'\u06F9' -> '0' + (char - '\u06F0')
            else -> char
        }
    }.joinToString("").take(NOTE_BODY_MAX)
