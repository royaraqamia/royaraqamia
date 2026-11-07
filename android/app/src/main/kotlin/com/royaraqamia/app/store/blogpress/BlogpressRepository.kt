package com.royaraqamia.app.store.blogpress

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.BlogpressPostSave
import com.royaraqamia.app.contracts.generated.BlogpressSyncSnapshot
import com.royaraqamia.app.contracts.generated.BlogpressSyncSnapshotPostsItem
import com.royaraqamia.app.contracts.generated.BlogpressSyncSnapshotPostsItemStatus
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
 * BlogPress's store, as the posts list uses it (#952), and its Outbox.
 *
 * The split between the operations is HabitFlow's (#650), SpendTrack's (#653)
 * and LinkSnap's (#654) rather than a fourth opinion:
 *
 * - [posts] answers from the database and nothing else. No session, no socket,
 *   no refresh: a cold launch with the radio off paints the rows the last pull
 *   wrote.
 * - [deletePost] and [restorePost] put the row **and** its replay intent in one
 *   transaction, so a write is durable before anything is sent. The screen
 *   paints the change immediately and the intent is what reaches the server
 *   later — after a kill, a reboot or a week offline.
 * - [drain] is the only code that sends a queued write, through the same
 *   [OutboxDrainer] the other three products drain with.
 * - [pull] is the only code that writes server rows, and it is pending-aware: a
 *   row with a queued intent is left alone (ADR-0029).
 *
 * The publication transitions the page only offers online (ADR-0031) —
 * publish, unpublish, pin and duplicate — are [ApiResult]s rather than queued
 * intents, because the page refuses them with the radio off and a queue that
 * accepted them would promise something the server cannot honour later.
 */
class BlogpressRepository(
    private val databases: IdentityScopedStore<BlogpressStores>,
    private val identity: () -> Identity,
    private val client: ApiClient,
    /** Whether a request can be sent now; guest queues never drain (ADR-0027). */
    private val signedIn: () -> Boolean = { true },
    /** Whether the radio is on. Injected so the JVM suite can pin a drain. */
    private val online: () -> Boolean = { true },
    private val clock: WriteClock = SystemWriteClock,
    private val random: () -> Double = { Math.random() },
    private val nowMillis: () -> Long = { System.currentTimeMillis() },
) : BlogpressEditorStore {
    /** One drain at a time, so two triggers cannot race for the same `seq`. */
    private val drainMutex = Mutex()

    /** The rows the dashboard paints, newest write first, tombstones excluded. */
    suspend fun posts(): List<BlogpressPostRow> = withContext(Dispatchers.IO) { dao().posts() }

    /** The row the editor opened (#954): the server id or the client id. */
    override suspend fun editorPost(id: String): BlogpressPostRow? =
        withContext(Dispatchers.IO) { dao().postByAnyId(id) }

    /**
     * Stores a row the community feed already read, when this identity's store
     * has never seen it (#925).
     *
     * The feed's page is a read of the same rows the blogpress sync would return,
     * so seeding from it makes the editor open with the radio off without a
     * second round trip. An existing row always wins: it may hold a queued draft,
     * and the feed's copy is older by definition.
     */
    override suspend fun rememberPost(row: BlogpressPostRow): BlogpressPostRow? =
        withContext(Dispatchers.IO) {
            val dao = dao()
            val existing = dao.postByAnyId(row.id) ?: dao.postByAnyId(row.clientId)
            if (existing != null) return@withContext existing
            dao.upsertPost(row)
            row
        }

    /**
     * Autosaves the editor's fields (#954).
     *
     * The row and its `post.save` intent commit together, so a shut radio, a
     * process kill or a reboot leaves the newest text on disk and the queue holds
     * the write that will carry it. The intent's payload is the generated
     * [BlogpressPostSave], so a field the server stops accepting breaks the
     * build rather than leaving a write that can never drain.
     *
     * `updatedAt` is the logical write time: a replay that arrives after a newer
     * draft loses at the server (ADR-0029), and the local row keeps the newest
     * text because the pull leaves a queued row alone.
     */
    override suspend fun saveDraft(
        id: String,
        fields: BlogpressEditorFields,
    ): BlogpressPostRow? = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.postByAnyId(id) ?: return@withContext null
        val now = clock.nowIso()
        val row =
            existing.copy(
                slug = fields.slug,
                content = fields.content,
                coverImage = fields.coverImage,
                metaTitle = fields.metaTitle,
                metaDesc = fields.metaDesc,
                updatedAt = now,
            )
        dao.commitPost(
            row,
            intent(
                type = "post.save",
                payload = BlogpressPayloads.save(row),
                createdAt = nowMillis(),
            ),
        )
        row
    }

    /**
     * Tombstones a post and queues its replay (#952).
     *
     * The local row and the intent commit together, so the tap survives a
     * process death in the next millisecond. The write is a tombstone, not a
     * removed row: the sync route is tombstone-inclusive, and a pull that
     * dropped it would resurrect the post on another device.
     */
    suspend fun deletePost(clientId: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.post(clientId) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitPost(
            existing.copy(deletedAt = now, updatedAt = now),
            intent(
                type = "post.delete",
                payload = BlogpressPayloads.delete(existing.id, now),
                createdAt = nowMillis(),
            ),
        )
        true
    }

    /**
     * Undo of a delete: clears the tombstone locally and queues the server's
     * restore route with the content half of the row (#528).
     */
    suspend fun restorePost(clientId: String): BlogpressPostRow? = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.post(clientId) ?: return@withContext null
        val now = clock.nowIso()
        val row = existing.copy(deletedAt = null, updatedAt = now)
        dao.commitPost(
            row,
            intent(
                type = "post.restore",
                payload = BlogpressPayloads.restore(existing),
                createdAt = nowMillis(),
            ),
        )
        row
    }

    /**
     * Replays the queue once (#952).
     *
     * The DAO is resolved **once**, for the identity the drain started under, and
     * every removal goes through it: resolving it per intent would reopen the
     * store under a new identity mid-run and delete another account's `seq`. A
     * sign-out during the run stops it instead.
     */
    override suspend fun drain(): DrainReport = withContext(Dispatchers.IO) {
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
    override suspend fun outboxStatus(): DrainReport = withContext(Dispatchers.IO) {
        val dao = dao()
        DrainReport(
            replayed = 0,
            pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
            failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
        )
    }

    /**
     * Writes the server's snapshot into the store, pending-aware (#952).
     *
     * Each row is a conflict between the server's copy and this device's, and
     * [OutboxRules.conflictWinner] answers it: a queued intent keeps the local
     * row, otherwise last write wins on `updatedAt` with ties going to the
     * device. Tombstones are written like any other row, so a delete made
     * elsewhere lands here instead of being invisible.
     */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        when (val answer = client.get<BlogpressSyncSnapshot>(SYNC_PATH)) {
            is ApiResult.Success -> {
                val dao = dao()
                val local = dao.allPosts().associateBy { it.clientId }
                val pending = pendingKeys(dao.outbox(), local.values)
                val rows =
                    answer.value.posts.mapNotNull { server ->
                        val row = server.toRow()
                        if (pending.contains(row.clientId) || pending.contains(row.id)) {
                            return@mapNotNull null
                        }
                        val existing = local[row.clientId]
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = existing?.updatedAt,
                                serverUpdatedAt = row.updatedAt,
                                pending = false,
                            )
                        if (existing == null || winner == ConflictWinner.Server) row else null
                    }
                dao.apply(rows)
                ApiResult.Success(answer.value.posts.size)
            }
            is ApiResult.Failure -> answer
        }
    }

    /**
     * The page's "new post": the server mints the row, and its id is what the
     * editor route opens (#952). Online-only, like the page.
     */
    suspend fun createPost(): ApiResult<String> =
        when (val answer = client.send("POST", BlogpressWriteTransport.POSTS_PATH)) {
            is ApiResult.Success -> {
                val id =
                    runCatching {
                            BlogpressPayloads.withNulls
                                .parseToJsonElement(answer.value)
                                .jsonObject["id"]
                                ?.jsonPrimitive
                                ?.content
                        }
                        .getOrNull()
                if (id.isNullOrEmpty()) {
                    ApiResult.Failure(
                        ApiError.InvalidContract("id", "the create answer carries no id")
                    )
                } else {
                    ApiResult.Success(id)
                }
            }
            is ApiResult.Failure -> answer
        }

    /** Publish a draft now (#952). Online-only, like the page (ADR-0031). */
    override suspend fun publishPost(id: String): ApiResult<String> =
        client.send("POST", postPath(id, "publish"))

    /** Unpublish a published post, or publish a scheduled one now. */
    suspend fun unpublishPost(id: String): ApiResult<String> =
        client.send("POST", postPath(id, "unpublish"))

    /** Pin or unpin a post from the dashboard. */
    suspend fun setFeatured(id: String, featured: Boolean): ApiResult<String> =
        client.send("POST", postPath(id, "featured"), """{"featured":$featured}""")

    /** Duplicate a post into a new draft. */
    suspend fun duplicatePost(id: String): ApiResult<String> =
        client.send("POST", postPath(id, "duplicate"))

    /** One intent, replayed, classified the way the web classifies it. */
    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request =
            runCatching { BlogpressWriteTransport.requestFor(entry) }.getOrNull()
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

    private fun intent(type: String, payload: String, createdAt: Long): OutboxIntentRow =
        OutboxIntentRow.pending(
            id = clock.uuid(),
            entity = "post",
            type = type,
            payload = payload,
            createdAt = createdAt,
        )

    private fun dao(): BlogpressDao = databases.forIdentity(identity()).dao()

    private fun postPath(id: String, action: String): String =
        "${BlogpressWriteTransport.POSTS_PATH}/${URLEncoder.encode(id, "UTF-8")}/$action"

    /**
     * The rows whose write is still queued, read from the intents themselves.
     *
     * A delete carries the server id; a restore carries it too. The local row's
     * `clientId` may be the client-minted identity rather than the server id, so
     * the id is translated through the rows on disk as well as matched directly.
     */
    private fun pendingKeys(
        outbox: List<OutboxIntentRow>,
        local: Collection<BlogpressPostRow>,
    ): Set<String> {
        val ids = mutableSetOf<String>()
        for (entry in outbox) {
            runCatching {
                    BlogpressPayloads.withNulls
                        .parseToJsonElement(entry.payload)
                        .jsonObject["id"]
                        ?.jsonPrimitive
                        ?.content
                }
                .getOrNull()
                ?.let(ids::add)
        }
        val keys = ids.toMutableSet()
        for (row in local) {
            if (ids.contains(row.id)) keys.add(row.clientId)
        }
        return keys
    }

    companion object {
        /** The route both clients pull from. */
        const val SYNC_PATH = "/api/blogpress/sync"
    }
}

/** The sync contract's row as the store holds it. */
fun BlogpressSyncSnapshotPostsItem.toRow(): BlogpressPostRow =
    BlogpressPostRow(
        clientId = client_id ?: id,
        id = id,
        slug = slug,
        content = content ?: "",
        status =
            when (status) {
                BlogpressSyncSnapshotPostsItemStatus.DRAFT -> "draft"
                BlogpressSyncSnapshotPostsItemStatus.PUBLISHED -> "published"
                BlogpressSyncSnapshotPostsItemStatus.SCHEDULED -> "scheduled"
            },
        coverImage = cover_image ?: "",
        metaTitle = meta_title ?: "",
        metaDesc = meta_desc ?: "",
        publishAt = publish_at,
        publishedAt = published_at,
        viewCount = view_count,
        featured = featured,
        communityVisible = community_visible,
        readingTimeMinutes = reading_time_minutes,
        createdAt = created_at,
        updatedAt = updated_at,
        deletedAt = deleted_at,
    )
