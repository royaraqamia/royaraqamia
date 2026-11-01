package com.royaraqamia.app.store.habitflow

import kotlin.math.floor
import kotlin.math.min
import kotlin.math.pow

/** What one replay attempt came to, which decides what happens to its intent. */
enum class SendOutcome {
    /** The server accepted it: the intent is removed. */
    Accepted,

    /** Retry later: the intent stays pending, backs off, and the run stops. */
    Transient,

    /** The server will never accept it: kept as `failed`, surfaced, never dropped. */
    Permanent,
}

/** Who keeps a row when a pull meets a local copy (ADR-0029). */
enum class ConflictWinner { Local, Server }

/**
 * The Outbox's rules, written once (#650).
 *
 * `shared/fixtures/offline-writes/habitflow.json` is the source of every case
 * here, and the web's `frontend/shared/local-store/outbox.ts` /
 * `conflict.ts` / `sync-transport.ts` are the other implementation. The two
 * engines sit on either side of a fixture that neither owns, so a rule changed in
 * one and not the other fails a suite instead of losing a write on a device
 * (`docs/mobile/two-clients.md`, rule 3).
 */
object OutboxRules {
    /** The first retry waits at most this long. */
    const val BACKOFF_BASE_MS = 2_000L

    /** …and no retry waits longer, however long the device stays offline. */
    const val BACKOFF_MAX_MS = 5 * 60 * 1_000L

    /**
     * Exponential backoff with full jitter (ADR-0029): the cap keeps a long-
     * offline device from hammering the server on reconnect, the jitter keeps
     * many devices from retrying in lockstep.
     *
     * `attempts` is the number *after* this failure, so the first failure uses
     * the base delay. `random` is a `[0, 1)` double, injected so the fixture can
     * pin an answer both clients must produce.
     */
    fun backoffDelay(attempts: Int, random: Double): Long {
        val exponent = maxOf(0, attempts - 1)
        val ceiling = min(BACKOFF_MAX_MS.toDouble(), BACKOFF_BASE_MS * 2.0.pow(exponent))
        return floor(random * ceiling).toLong()
    }

    /** Whether an intent may be sent now. A failed one is never due on its own. */
    fun isDue(status: String, nextAttemptAt: Long, now: Long): Boolean =
        status == OutboxIntentRow.STATUS_PENDING && nextAttemptAt <= now

    /**
     * The split the web's `classifySyncError` makes, from an HTTP status.
     *
     * 401 is retryable because it means "no session right now", not "this intent
     * is malformed": the write must survive until sign-in, not be failed. 408,
     * 409, 425 and 429 are the server saying "later", and 5xx is the server
     * failing. Everything else in 4xx is the server refusing this body.
     */
    fun classify(status: Int?): SendOutcome = when {
        status == null -> SendOutcome.Transient
        status in 200..299 -> SendOutcome.Accepted
        status >= 500 -> SendOutcome.Transient
        status >= 400 && status !in RETRYABLE_STATUS -> SendOutcome.Permanent
        else -> SendOutcome.Transient
    }

    /**
     * Who wins when a pull meets the local copy.
     *
     * Last write wins on `updatedAt`, and ties go to the device: the server has
     * to be *strictly* newer to replace a row, so a pull that arrives with the
     * same timestamp cannot undo an edit made in the same millisecond. A row
     * whose write is still queued is not a conflict at all — the device's copy is
     * what the user is looking at, and the server is about to hear about it.
     */
    fun conflictWinner(
        localUpdatedAt: String?,
        serverUpdatedAt: String?,
        pending: Boolean,
    ): ConflictWinner = when {
        pending -> ConflictWinner.Local
        localUpdatedAt.isNullOrEmpty() -> ConflictWinner.Server
        serverUpdatedAt.isNullOrEmpty() -> ConflictWinner.Local
        serverUpdatedAt > localUpdatedAt -> ConflictWinner.Server
        else -> ConflictWinner.Local
    }

    private val RETRYABLE_STATUS = setOf(401, 408, 409, 425, 429)
}
