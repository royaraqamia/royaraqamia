package com.royaraqamia.app.store.leads

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.TrainingCohortsResponse
import com.royaraqamia.app.contracts.generated.TrainingCohortsResponseCohortsItem
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
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** What one lead submission came to, which is what the form draws. */
sealed interface LeadSubmitOutcome {
    /** The server took it; the reference code is the visitor's to quote. */
    data class Sent(val referenceCode: String) : LeadSubmitOutcome

    /** No radio: the submission is on the device and will replay. */
    data object Queued : LeadSubmitOutcome

    /** The server refused this body; nothing was queued, and the sentence is its own. */
    data class Failed(val message: String?) : LeadSubmitOutcome
}

/**
 * The lead forms' Outbox (#929), the one seam the screen talks to.
 *
 * It is deliberately the same shape as HabitFlow's, SpendTrack's and LinkSnap's
 * queues: [submit] writes a delivery intent, [drain] replays through the shared
 * [OutboxDrainer], and the receipt is the only local row. What differs is the
 * audience — a lead is anonymous, so:
 *
 * - the queue lives in one guest-named file, not an identity partition, and a
 *   sign-in neither hides a pending lead nor sends it twice;
 * - a drain is never gated on a session: with one, the request carries the
 *   bearer so the server attributes the lead; without one, it goes public;
 * - a submission whose connection dropped is queued rather than failed, because
 *   an unsent lead is the one thing the page must not lose.
 */
class LeadsRepository(
    private val stores: LeadsStores,
    private val client: ApiClient,
    /** Whether a request can carry a bearer now; a guest's lead still sends. */
    private val signedIn: () -> Boolean = { true },
    /** Whether the radio is on. Injected so the JVM suite can pin a drain. */
    private val online: () -> Boolean = { true },
    private val clock: WriteClock = SystemWriteClock,
    private val random: () -> Double = { Math.random() },
    private val nowMillis: () -> Long = { System.currentTimeMillis() },
) {
    /** One drain at a time, so two triggers cannot race for the same `seq`. */
    private val drainMutex = Mutex()

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /**
     * Submits one form (#929).
     *
     * Online the request is sent immediately and its reference code is stored;
     * with no radio — or with a connection that dropped before an answer — the
     * body is queued and the form says so. A server refusal is returned as a
     * sentence and never queued: replaying a body the server will always refuse
     * is a failure the visitor cannot see.
     */
    suspend fun submit(kind: LeadKind, draft: LeadDraft): LeadSubmitOutcome =
        withContext(Dispatchers.IO) {
            val clientId = clock.uuid()
            val body = LeadsWriteTransport.encode(kind, draft, clientId)

            if (!online()) {
                enqueue(kind, body)
                return@withContext LeadSubmitOutcome.Queued
            }

            when (val attempt = send(kind, body)) {
                is Attempt.Accepted -> {
                    attempt.reference?.let { saveReceipt(kind, it) }
                    LeadSubmitOutcome.Sent(attempt.reference.orEmpty())
                }
                Attempt.Transient -> {
                    enqueue(kind, body)
                    LeadSubmitOutcome.Queued
                }
                is Attempt.Refused -> LeadSubmitOutcome.Failed(attempt.message)
            }
        }

    /** Replays the queue once, through the same drainer every product uses. */
    suspend fun drain(): DrainReport = withContext(Dispatchers.IO) {
        drainMutex.withLock {
            val dao = stores.dao()
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
                send = ::replay,
                // Leads are anonymous: a guest's queue drains too (ADR-0029's
                // lead exception, `docs/specs/offline-first.md`).
                signedIn = { true },
                online = online,
                now = nowMillis,
                random = random,
            ).drain()
        }
    }

    /** A manual retry: every failed intent is re-armed, then the queue drains. */
    suspend fun retryFailed(): DrainReport = withContext(Dispatchers.IO) {
        stores.dao().retryFailedIntents()
        drain()
    }

    /** What the device owes, without sending anything. */
    suspend fun outboxStatus(): DrainReport = withContext(Dispatchers.IO) {
        val dao = stores.dao()
        DrainReport(
            replayed = 0,
            pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
            failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
        )
    }

    /** The forms with something still waiting, so each can show its queued panel. */
    suspend fun pendingKinds(): Set<LeadKind> = withContext(Dispatchers.IO) {
        stores.dao().queuedTypes().mapNotNull(LeadKind::ofIntentType).toSet()
    }

    /**
     * The open cohorts the training form picks from (#929), on the page's own
     * public route. A failed read is a form with no cohort to choose, which is
     * the page's own degradation rather than an error card.
     */
    suspend fun openCohorts(): List<TrainingCohortsResponseCohortsItem> = withContext(Dispatchers.IO) {
        when (val answer = client.getPublic("/api/training/cohorts", TrainingCohortsResponse.serializer())) {
            is ApiResult.Success -> answer.value.cohorts
            is ApiResult.Failure -> emptyList()
        }
    }

    /** The reference code a form reached, or `null` when it has none yet. */
    suspend fun receipt(kind: LeadKind): String? = withContext(Dispatchers.IO) {
        stores.dao().receipt(kind.receiptKind)?.referenceCode
    }

    /** Starts a fresh submission, dropping the remembered code. */
    suspend fun dismissReceipt(kind: LeadKind) = withContext(Dispatchers.IO) {
        stores.dao().clearReceipt(kind.receiptKind)
    }

    /** One intent, replayed and classified the way the web classifies it. */
    private suspend fun replay(entry: OutboxIntentRow): SendOutcome {
        val kind = LeadKind.ofIntentType(entry.type) ?: return SendOutcome.Permanent
        return when (val attempt = send(kind, entry.payload)) {
            is Attempt.Accepted -> {
                attempt.reference?.let { saveReceipt(kind, it) }
                SendOutcome.Accepted
            }
            Attempt.Transient -> SendOutcome.Transient
            is Attempt.Refused -> SendOutcome.Permanent
        }
    }

    /**
     * One POST, with the bearer when there is a session and publicly when there
     * is not. Both routes are the same route; the difference is only whether the
     * server can attribute the lead to an account.
     */
    private suspend fun send(kind: LeadKind, body: String): Attempt {
        val answer: ApiResult<String> =
            if (signedIn()) {
                client.send("POST", kind.endpoint, body)
            } else {
                client.sendPublic("POST", kind.endpoint, body)
            }

        return when (answer) {
            is ApiResult.Success -> Attempt.Accepted(referenceOf(answer.value))
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Server ->
                        when (OutboxRules.classify(error.status)) {
                            SendOutcome.Permanent -> Attempt.Refused(messageOf(error.detail))
                            else -> Attempt.Transient
                        }
                    // No session right now is "later", not "never"; the next
                    // drain tries the public route (ADR-0027).
                    ApiError.NotSignedIn -> Attempt.Transient
                    is ApiError.Network -> Attempt.Transient
                    // A 2xx body the client could not shape still carried the
                    // write; the only loss is the code, so it is not retried.
                    is ApiError.InvalidContract -> Attempt.Accepted(null)
                }
        }
    }

    private suspend fun enqueue(kind: LeadKind, body: String) {
        stores.dao().insertIntent(
            OutboxIntentRow.pending(
                id = clock.uuid(),
                entity = "lead",
                type = kind.intentType,
                payload = body,
                createdAt = nowMillis(),
            )
        )
    }

    private suspend fun saveReceipt(kind: LeadKind, referenceCode: String) {
        if (referenceCode.isBlank()) return
        stores.dao().upsertReceipt(
            LeadReceiptRow(
                kind = kind.receiptKind,
                referenceCode = referenceCode,
                updatedAt = nowMillis(),
            )
        )
    }

    private fun referenceOf(body: String): String? =
        runCatching {
            json.parseToJsonElement(body).jsonObject["referenceCode"]?.jsonPrimitive?.content
        }.getOrNull()

    /** The server's own refusal sentence; the screen supplies its fallback. */
    private fun messageOf(body: String): String? =
        runCatching {
            json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content
        }.getOrNull()?.takeIf { it.isNotBlank() }

    private sealed interface Attempt {
        data class Accepted(val reference: String?) : Attempt

        data object Transient : Attempt

        data class Refused(val message: String?) : Attempt
    }
}
