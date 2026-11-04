package com.royaraqamia.app.store.linksnap

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.LinksnapAvailabilityResponse
import com.royaraqamia.app.contracts.generated.LinksnapAvailabilityResponseAvailability
import com.royaraqamia.app.contracts.generated.LinksnapShortenResponse
import com.royaraqamia.app.contracts.generated.LinksnapSyncResponse
import com.royaraqamia.app.contracts.generated.LinksnapSyncResponseLinksItem
import com.royaraqamia.app.contracts.generated.LinksnapUnlockResponse
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
import java.net.URI
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * What an edit changes (#654). `expiresAtSet` and `passwordSet` keep "leave it"
 * apart from "clear it": the route reads `null` as a removal, and a body that
 * always carried null would clear both on every edit.
 */
data class LinksnapEdit(
    val newCode: String? = null,
    val originalUrl: String? = null,
    val expiresAt: String? = null,
    val expiresAtSet: Boolean = false,
    val password: String? = null,
    val passwordSet: Boolean = false,
)

/**
 * LinkSnap's store, as the screen uses it (#654), and its Outbox.
 *
 * The split between the operations is the point, and it is HabitFlow's (#650)
 * and SpendTrack's (#653) rather than a third opinion:
 *
 * - [links] answers from the database and nothing else. No session, no socket,
 *   no refresh: an expired token cannot delay a paint, and a cold launch with
 *   the radio off paints the rows the last pull wrote.
 * - [createLink], [updateLink], [deleteLink] and [restoreLink] put the row
 *   **and** its replay intent in one transaction, so a write is durable before
 *   anything is sent. The screen paints the row immediately and the intent is
 *   what reaches the server later — after a kill, a reboot or a week offline.
 * - [drain] is the only code that sends a queued write, through the same
 *   [OutboxDrainer] HabitFlow and SpendTrack drain with.
 * - [pull] is the only code that writes server rows, and it is pending-aware: a
 *   row with a queued intent is left alone (ADR-0029).
 *
 * Identity comes from a lambda rather than a stored field so a sign-out inside
 * the process changes which database the next call opens
 * ([IdentityScopedStore]). The queue is rows in that identity's own file, so an
 * intent is drained by the identity that queued it and by no other.
 */
class LinksnapRepository(
    private val databases: IdentityScopedStore<LinksnapStores>,
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

    /** The rows the dashboard paints, newest first, tombstones excluded. */
    suspend fun links(): List<LinksnapLinkRow> = withContext(Dispatchers.IO) { dao().links() }

    /**
     * Adds a link: the row and its `link.create` intent commit together, so the
     * tap is durable even if the process dies in the next millisecond.
     */
    suspend fun createLink(
        originalUrl: String,
        customCode: String? = null,
        password: String? = null,
    ): LinksnapLinkRow = withContext(Dispatchers.IO) {
        val sanitized = validateUrl(originalUrl)
        val code = ensureUniqueCode(customCode)
        val now = clock.nowIso()
        val clientId = clock.uuid()
        val row =
            LinksnapLinkRow(
                clientId = clientId,
                code = code,
                originalUrl = sanitized,
                createdAt = now,
                updatedAt = now,
                expiresAt = null,
                isBlocked = false,
                passwordProtected = !password.isNullOrEmpty(),
                deletedAt = null,
            )
        val payload =
            LinksnapPayloads.create(
                originalUrl = row.originalUrl,
                customCode = code,
                clientId = clientId,
                expiresAt = null,
                password = password,
                updatedAt = now,
            )
        dao().commitLink(row, intent("link.create", payload, nowMillis()))
        row
    }

    /**
     * A visitor's create, answered by the server (#654).
     *
     * A guest's link is only meaningful on the server, so it is not queued; the
     * route is the same public shortener the page calls. Offline, the failure is
     * returned for the screen to name the connection.
     */
    suspend fun createOnlineLink(
        originalUrl: String,
        customCode: String? = null,
        password: String? = null,
    ): ApiResult<LinksnapLinkRow> = withContext(Dispatchers.IO) {
        val sanitized = validateUrl(originalUrl)
        val code = sanitizeCode(customCode)
        val now = clock.nowIso()
        val body =
            LinksnapPayloads.create(
                originalUrl = sanitized,
                customCode = code,
                clientId = clock.uuid(),
                expiresAt = null,
                password = password,
                updatedAt = now,
            )
        when (val answer = client.postPublic<LinksnapShortenResponse>(SYNC_SHORTEN_PATH, body)) {
            is ApiResult.Success -> ApiResult.Success(answer.value.link.toRow())
            is ApiResult.Failure -> answer
        }
    }

    /**
     * Whether a custom code can be taken (#916), answered by the site's own route.
     *
     * The query is the sanitized slug the member typed, the bearer is the
     * session, and the answer is the generated contract rather than a guess: a
     * slug uniqueness rule is server-owned (ADR-0031), so the app asks instead
     * of duplicating it. The screen decides when to ask - after the debounce and
     * never while the radio is off - so this stays one read.
     */
    suspend fun checkAvailability(
        code: String
    ): ApiResult<LinksnapAvailabilityResponseAvailability> = withContext(Dispatchers.IO) {
        val slug = sanitizeCode(code)
        val path = "$AVAILABILITY_PATH?code=${URLEncoder.encode(slug, "UTF-8")}"
        when (val answer = client.get<LinksnapAvailabilityResponse>(path)) {
            is ApiResult.Success -> ApiResult.Success(answer.value.availability)
            is ApiResult.Failure -> answer
        }
    }

    /**
     * Edits an owned link. The row and its `link.update` intent commit together.
     *
     * `originalUrl` always travels in the replay (the web does the same): the
     * route refuses an update with nothing changed, and an edit of a tombstoned
     * row is an undo as well as an edit.
     */
    suspend fun updateLink(clientId: String, edit: LinksnapEdit): LinksnapLinkRow? =
        withContext(Dispatchers.IO) {
            val dao = dao()
            val existing = dao.link(clientId) ?: return@withContext null
            val now = clock.nowIso()
            val newCode = edit.newCode?.takeIf { it.isNotBlank() }?.let(::sanitizeCustomCode)
            if (newCode != null && newCode != existing.code) {
                validateCode(newCode)
                if (dao.allLinks().any { it.code == newCode }) {
                    throw IllegalArgumentException("هذا الرمز مستخدم بالفعل")
                }
            }
            val passwordProtected =
                when {
                    edit.passwordSet -> !edit.password.isNullOrEmpty()
                    else -> existing.passwordProtected
                }
            val row =
                existing.copy(
                    code = newCode ?: existing.code,
                    originalUrl = edit.originalUrl?.let(::validateUrl) ?: existing.originalUrl,
                    expiresAt = if (edit.expiresAtSet) edit.expiresAt else existing.expiresAt,
                    passwordProtected = passwordProtected,
                    updatedAt = now,
                    deletedAt = null,
                )
            val payload =
                LinksnapPayloads.update(
                    code = existing.code,
                    clientId = clientId,
                    newCode = row.code.takeIf { it != existing.code },
                    originalUrl = row.originalUrl,
                    expiresAtSet = edit.expiresAtSet,
                    expiresAt = row.expiresAt,
                    passwordSet = edit.passwordSet,
                    password = edit.password,
                    updatedAt = now,
                )
            dao.commitLink(row, intent("link.update", payload, nowMillis()))
            row
        }

    /** Tombstones a link: a removal, not a row the next pull re-creates. */
    suspend fun deleteLink(clientId: String): Boolean = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.link(clientId) ?: return@withContext false
        val now = clock.nowIso()
        dao.commitLink(
            existing.copy(deletedAt = now, updatedAt = now),
            intent(
                type = "link.delete",
                payload = LinksnapPayloads.delete(existing.code, clientId, now),
                createdAt = nowMillis(),
            ),
        )
        true
    }

    /** Undo of a delete: clears the tombstone locally and on the server (resurrect). */
    suspend fun restoreLink(clientId: String): LinksnapLinkRow? = withContext(Dispatchers.IO) {
        val dao = dao()
        val existing = dao.link(clientId) ?: return@withContext null
        val now = clock.nowIso()
        val row = existing.copy(deletedAt = null, updatedAt = now)
        val payload =
            LinksnapPayloads.update(
                code = existing.code,
                clientId = clientId,
                originalUrl = existing.originalUrl,
                expiresAtSet = true,
                expiresAt = existing.expiresAt,
                updatedAt = now,
                deletedAtSet = true,
                deletedAt = null,
            )
        dao.commitLink(row, intent("link.update", payload, nowMillis()))
        row
    }

    /**
     * Replays the queue once (#654).
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
     * Writes the server's page into the store, pending-aware (#654).
     *
     * Each row is a conflict between the server's copy and this device's, and
     * [OutboxRules.conflictWinner] answers it: a queued intent keeps the local
     * row, otherwise last write wins on `updatedAt` with ties going to the
     * device. Tombstones are written like any other row, so a delete made
     * elsewhere lands here instead of being invisible.
     */
    suspend fun pull(): ApiResult<Int> = withContext(Dispatchers.IO) {
        when (val answer = client.get<LinksnapSyncResponse>(SYNC_PATH)) {
            is ApiResult.Success -> {
                val dao = dao()
                val pending = pendingClientIds(dao.outbox())
                val local = dao.allLinks().associateBy { it.clientId }
                val rows =
                    answer.value.links.mapNotNull { server ->
                        val row = server.toRow()
                        if (pending.contains(row.clientId)) return@mapNotNull null
                        val winner =
                            OutboxRules.conflictWinner(
                                localUpdatedAt = local[row.clientId]?.updatedAt,
                                serverUpdatedAt = row.updatedAt,
                                pending = false,
                            )
                        if (winner == ConflictWinner.Server) row else null
                    }
                dao.apply(rows)
                ApiResult.Success(answer.value.links.size)
            }
            is ApiResult.Failure -> answer
        }
    }

    /**
     * Resolves a protected link against the server (#654).
     *
     * Unlock is a live read, never a queued write: the password is checked
     * server-side and the destination is the answer. Offline, the failure is
     * returned rather than guessed, so the screen can say it needs a connection.
     */
    suspend fun unlock(code: String, password: String): ApiResult<String> =
        withContext(Dispatchers.IO) {
            val body = LinksnapPayloads.unlock(code, password)
            when (val answer = client.postPublic<LinksnapUnlockResponse>(UNLOCK_PATH, body)) {
                is ApiResult.Success -> ApiResult.Success(answer.value.originalUrl)
                is ApiResult.Failure -> answer
            }
        }

    /** One intent, replayed, classified the way the web classifies it. */
    private suspend fun send(entry: OutboxIntentRow): SendOutcome {
        val request =
            runCatching { LinksnapWriteTransport.requestFor(entry) }.getOrNull()
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
            entity = "link",
            type = type,
            payload = payload,
            createdAt = createdAt,
        )

    private fun dao(): LinksnapDao = databases.forIdentity(identity()).dao()

    /** The row whose write is still queued, read from the intent itself. */
    private fun pendingClientIds(outbox: List<OutboxIntentRow>): Set<String> {
        val keys = mutableSetOf<String>()
        for (entry in outbox) {
            runCatching {
                    LinksnapPayloads.withNulls
                        .parseToJsonElement(entry.payload)
                        .jsonObject["clientId"]
                        ?.jsonPrimitive
                        ?.content
                }
                .getOrNull()
                ?.let(keys::add)
        }
        return keys
    }

    /** The client-side twin of the server's `getLinkStatus` (ADR-0027). */
    fun statusOf(row: LinksnapLinkRow): String = LinksnapStatus.of(row, nowMillis())

    private suspend fun ensureUniqueCode(candidate: String?): String {
        val custom = sanitizeCode(candidate)
        if (custom.isNotEmpty()) {
            validateCode(custom)
            val taken = dao().allLinks().any { it.code == custom }
            if (!taken) return custom
        }
        val used = dao().allLinks().map { it.code }.toSet()
        repeat(MAX_CODE_ATTEMPTS) {
            val code = randomCode()
            if (!used.contains(code)) return code
        }
        val longer = (randomCode() + randomCode()).take(12)
        return longer
    }

    private fun validateCode(code: String) {
        require(code.length in MIN_CODE_LENGTH..MAX_CODE_LENGTH) {
            "custom short code must be 3-16 characters"
        }
    }

    private fun validateUrl(originalUrl: String): String {
        val trimmed = originalUrl.trim()
        require(trimmed.isNotEmpty()) { "a link needs a destination" }
        val parsed =
            runCatching { URI(trimmed) }.getOrNull()
                ?: throw IllegalArgumentException("invalid URL")
        require(parsed.scheme == "http" || parsed.scheme == "https") {
            "a link must start with http:// or https://"
        }
        return trimmed
    }

    private fun sanitizeCode(code: String?): String =
        (code ?: "").trim().replace(Regex("[^a-zA-Z0-9_-]"), "").take(MAX_CODE_LENGTH)

    private fun sanitizeCustomCode(code: String): String = sanitizeCode(code)

    private fun randomCode(): String {
        val builder = StringBuilder(CODE_LENGTH)
        repeat(CODE_LENGTH) {
            val index = (random() * CODE_CHARS.length).toInt().coerceIn(0, CODE_CHARS.lastIndex)
            builder.append(CODE_CHARS[index])
        }
        return builder.toString()
    }

    companion object {
        /** The route both clients pull from. */
        const val SYNC_PATH = "/linksnap/api/links/sync"

        /** The public shortener the page calls. */
        const val SYNC_SHORTEN_PATH = "/linksnap/api/shorten"

        /** The public unlock route. */
        const val UNLOCK_PATH = "/linksnap/api/unlock"

        /** The custom-code check the signed-in form debounces (#916). */
        const val AVAILABILITY_PATH = "/linksnap/api/availability"

        const val MIN_CODE_LENGTH = 3
        const val MAX_CODE_LENGTH = 16

        private const val CODE_LENGTH = 6
        private const val MAX_CODE_ATTEMPTS = 8
        private const val CODE_CHARS =
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    }
}

/** The client-side twin of `backend/services/linksnap/link-status.ts`. */
object LinksnapStatus {
    fun of(row: LinksnapLinkRow, nowMillis: Long): String {
        if (row.isBlocked) return "blocked"
        val expiry = row.expiresAt
        if (!expiry.isNullOrEmpty()) {
            val parsed = runCatching { java.time.Instant.parse(expiry) }.getOrNull()
            if (parsed != null && parsed.toEpochMilli() < nowMillis) return "expired"
        }
        return "active"
    }
}

/** The sync contract's row as the store holds it. */
fun LinksnapSyncResponseLinksItem.toRow(): LinksnapLinkRow =
    LinksnapLinkRow(
        clientId = clientId ?: code,
        code = code,
        originalUrl = originalUrl,
        createdAt = createdAt,
        updatedAt = updatedAt ?: createdAt,
        expiresAt = expiresAt,
        isBlocked = isBlocked ?: false,
        passwordProtected = passwordProtected ?: false,
        deletedAt = deletedAt,
    )

/** The shortener's answer as the store holds it (used by a guest's online create). */
fun com.royaraqamia.app.contracts.generated.LinksnapShortenResponseLink.toRow(): LinksnapLinkRow =
    LinksnapLinkRow(
        clientId = clientId ?: code,
        code = code,
        originalUrl = originalUrl,
        createdAt = createdAt,
        updatedAt = updatedAt ?: createdAt,
        expiresAt = expiresAt,
        isBlocked = isBlocked ?: false,
        passwordProtected = passwordProtected ?: false,
        deletedAt = deletedAt,
    )
