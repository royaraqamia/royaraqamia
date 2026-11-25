package com.royaraqamia.app.quran

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
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

/** What a tap on an Ayah's mark came to, as the control paints it. */
data class BookmarkToggle(val marked: Boolean, val refusal: String?)

/**
 * The reader's owned records (#1751): marks and position, kept in the device's
 * Local Store and replayed to the site's two routes.
 *
 * The split is the same as Notes': [bookmarks] and [position] answer from the
 * database alone, [toggleBookmark] and [savePosition] write the row and its
 * replay intent in one transaction, and [drain] is the only code that sends a
 * queued write. A guest's rows stay on the device; a signed-in reader's rows
 * are pulled from `/quran/api/sync` and sent to the two POST routes, so a phone
 * and a browser resume the same Ayah.
 */
class QuranReaderStore(
    private val databases: IdentityScopedStore<QuranOwnStores>,
    private val identity: () -> Identity,
    private val client: ApiClient,
    private val signedIn: () -> Boolean = { true },
    private val online: () -> Boolean = { true },
    private val clock: WriteClock = SystemWriteClock,
    private val nowMillis: () -> Long = { System.currentTimeMillis() },
) {
    private val drainMutex = Mutex()

    /** The server's own 402 sentence, surfaced verbatim rather than retyped. */
    var lastRefusal: String? = null

    suspend fun bookmarks(): List<QuranBookmarkRow> =
        withContext(Dispatchers.IO) { dao().liveBookmarks() }

    suspend fun position(): QuranReadingPosition? =
        withContext(Dispatchers.IO) {
            dao().position()?.let { QuranReadingPosition(it.surah, it.ayah, it.updatedAt) }
        }

    /**
     * Marks or unmarks one Ayah. The row and its `quran.bookmark.set` intent
     * commit together, so the tap survives a kill; a signed-in reader then
     * replays it at once when the radio is on, which is what lets the server's
     * plan refusal be shown in the reader's own words.
     */
    suspend fun toggleBookmark(surah: Int, ayah: Int): BookmarkToggle =
        withContext(Dispatchers.IO) {
            val dao = dao()
            val existing = dao.bookmark(surah, ayah)
            val marked = existing == null || existing.deletedAt != null
            val now = clock.nowIso()
            val clientId = existing?.clientId ?: clock.uuid()
            val row =
                QuranBookmarkRow(
                    clientId = clientId,
                    surah = surah,
                    ayah = ayah,
                    createdAt = existing?.createdAt ?: now,
                    updatedAt = now,
                    deletedAt = if (marked) null else now,
                )
            dao.commitBookmark(
                row,
                pendingIntent(
                    QuranOwnDao.BOOKMARK_INTENT,
                    QuranWriteTransport.bookmarkPayload(surah, ayah, clientId, now, row.deletedAt),
                ),
            )
            lastRefusal = null
            if (signedIn() && online()) drain()
            BookmarkToggle(marked = marked, refusal = lastRefusal)
        }

    /** Moves the reader's place, superseding any position write still queued. */
    suspend fun savePosition(surah: Int, ayah: Int) =
        withContext(Dispatchers.IO) {
            if (surah !in 1..QURAN_SURAH_COUNT || ayah !in 1..LONGEST_SURA) return@withContext
            val dao = dao()
            val now = clock.nowIso()
            val clientId = dao.position()?.clientId ?: clock.uuid()
            dao.commitPosition(
                QuranPositionRow(surah = surah, ayah = ayah, updatedAt = now, clientId = clientId),
                pendingIntent(
                    QuranOwnDao.POSITION_INTENT,
                    QuranWriteTransport.positionPayload(surah, ayah, clientId, now),
                ),
            )
            if (signedIn() && online()) drain()
        }

    /** Replays the queue once. A plan refusal is kept as `failed`, never dropped. */
    suspend fun drain(): DrainReport =
        withContext(Dispatchers.IO) {
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
                    stillOurs = { identity() == expected },
                ).drain()
            }
        }

    suspend fun outboxStatus(): DrainReport =
        withContext(Dispatchers.IO) {
            val dao = dao()
            DrainReport(
                replayed = 0,
                pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
                failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
            )
        }

    suspend fun retryFailed(): DrainReport =
        withContext(Dispatchers.IO) {
            dao().retryFailedIntents()
            drain()
        }

    /**
     * The pull, pending-aware: a row with a queued intent is left alone because
     * it is about to be told to the server (ADR-0029), and the cursor moves
     * only when nothing was held back so the row is asked for again.
     */
    suspend fun pull(): ApiResult<Int> =
        withContext(Dispatchers.IO) {
            if (!signedIn()) return@withContext ApiResult.Success(0)
            val since = dao().meta(QuranOwnDao.CURSOR_KEY)?.value
            val path =
                if (since == null) {
                    SYNC_PATH
                } else {
                    "$SYNC_PATH?since=${URLEncoder.encode(since, "UTF-8")}"
                }
            when (val answer = client.get<QuranSyncSnapshotWire>(path)) {
                is ApiResult.Failure -> answer
                is ApiResult.Success -> {
                    val snapshot = answer.value
                    val dao = dao()
                    val pendingTypes = dao.outbox().map { it.type }.toSet()
                    val pendingAyahs =
                        dao.outbox()
                            .filter { it.type == QuranOwnDao.BOOKMARK_INTENT }
                            .mapNotNull { ayahOf(it.payload) }
                            .toSet()
                    val local = dao.allBookmarks().associateBy { "${it.surah}:${it.ayah}" }

                    var skipped = 0
                    val writes = mutableListOf<QuranBookmarkRow>()
                    for (server in snapshot.bookmarks) {
                        if ("${server.surah}:${server.ayah}" in pendingAyahs) {
                            skipped += 1
                            continue
                        }
                        val current = local["${server.surah}:${server.ayah}"]
                        if (current == null || server.updatedAt > current.updatedAt) {
                            writes.add(
                                QuranBookmarkRow(
                                    clientId = server.clientId,
                                    surah = server.surah,
                                    ayah = server.ayah,
                                    createdAt = server.createdAt,
                                    updatedAt = server.updatedAt,
                                    deletedAt = server.deletedAt,
                                )
                            )
                        }
                    }
                    val position = snapshot.position
                    if (
                        position != null &&
                        QuranOwnDao.POSITION_INTENT !in pendingTypes
                    ) {
                        val current = dao.position()
                        if (current == null || position.updatedAt > current.updatedAt) {
                            dao.upsertPosition(
                                QuranPositionRow(
                                    surah = position.surah,
                                    ayah = position.ayah,
                                    updatedAt = position.updatedAt,
                                    clientId = current?.clientId ?: clock.uuid(),
                                )
                            )
                        }
                    }
                    dao.applyPull(writes, if (skipped == 0) snapshot.cursor else null)
                    ApiResult.Success(snapshot.bookmarks.size)
                }
            }
        }

    /** A guest's rows follow the reader into the account on sign-in, as on the site. */
    suspend fun claimFromGuest() =
        withContext(Dispatchers.IO) {
            val user = identity()
            if (user == Identity.Guest) return@withContext
            val guest = databases.forIdentity(Identity.Guest).dao()
            val dao = databases.forIdentity(user).dao()
            dao.upsertBookmarks(guest.allBookmarks())
            guest.position()?.let { dao.upsertPosition(it) }
            guest.outbox().forEach { dao.insertIntent(it) }
            guest.clearBookmarks()
            guest.clearPosition()
            guest.clearOutbox()
            guest.clearMeta()
        }

    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request = runCatching { QuranWriteTransport.requestFor(entry) }.getOrNull()
            ?: return SendOutcome.Permanent
        return when (val answer = client.send(request.method, request.path, request.body)) {
            is ApiResult.Success -> SendOutcome.Accepted
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Server -> {
                        if (error.status == 402) lastRefusal = refusalSentence(error.detail)
                        OutboxRules.classify(error.status)
                    }
                    ApiError.NotSignedIn -> SendOutcome.Transient
                    is ApiError.Network -> SendOutcome.Transient
                    is ApiError.InvalidContract -> SendOutcome.Permanent
                }
        }
    }

    private fun pendingIntent(type: String, payload: String): OutboxIntentRow =
        OutboxIntentRow.pending(
            id = clock.uuid(),
            entity = "quran",
            type = type,
            payload = payload,
            createdAt = nowMillis(),
        )

    /**
     * The server's own cap sentence, read from its 402 body rather than
     * retyped: the web shows the same words, with the account's real cap in
     * them, and so does the reader.
     */
    private fun refusalSentence(detail: String): String =
        runCatching {
            val element = kotlinx.serialization.json.Json.parseToJsonElement(detail)
            element.jsonObject["error"]?.jsonPrimitive?.content
        }.getOrNull() ?: detail

    private fun ayahOf(payload: String): String? =
        runCatching {
            val surah = payload.substringAfter("\"surah\":").substringBefore(',').toIntOrNull()
            val ayah = payload.substringAfter("\"ayah\":").substringBefore(',').toIntOrNull()
            if (surah == null || ayah == null) null else "$surah:$ayah"
        }.getOrNull()

    private fun dao(): QuranOwnDao = databases.forIdentity(identity()).dao()

    companion object {
        const val SYNC_PATH = "/quran/api/sync"
        const val QURAN_SURAH_COUNT = 114
        const val LONGEST_SURA = 286
    }
}
