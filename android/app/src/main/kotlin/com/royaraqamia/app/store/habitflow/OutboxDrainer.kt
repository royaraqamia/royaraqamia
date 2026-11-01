package com.royaraqamia.app.store.habitflow

/** What one drain came to, which is what the pill and the drill report. */
data class DrainReport(
    /** Intents the server accepted during this run. */
    val replayed: Int,
    /** Intents still queued: backed off, or never attempted. */
    val pending: Int,
    /** Intents the server refused permanently. */
    val failed: Int,
)

/** The slice of the store the drainer reads and writes; kept narrow so it is easy to fake. */
interface OutboxQueue {
    suspend fun entries(): List<OutboxIntentRow>
    suspend fun remove(seq: Long)
    suspend fun patch(
        entry: OutboxIntentRow,
        attempts: Int,
        status: String,
        lastError: String?,
        nextAttemptAt: Long,
    )
}

/**
 * Replays the Outbox to the server (#650), with the web's rules rather than a
 * second opinion about them (`shared/fixtures/offline-writes/habitflow.json`):
 *
 * - strict order — a pending intent that is not due stops the run, so a later
 *   write never overtakes an earlier one;
 * - a permanent refusal is kept as `failed` and surfaced, never dropped, and the
 *   run continues past it;
 * - a transient failure backs the intent off and stops the run;
 * - an accepted intent is removed, and nothing else removes one.
 *
 * The engine is product-agnostic — the queue and the sender are injected — so
 * the JVM suite can run it against the fixture's cases without a database, and
 * the repository can bind it to real Room access without the engine knowing.
 *
 * It also stops when the store's identity changes mid-run: an intent belongs to
 * the identity that queued it, and a sign-out during a flush must not have the
 * next `seq` it reads removed from another account's queue.
 */
class OutboxDrainer(
    private val queue: OutboxQueue,
    private val send: suspend (OutboxIntentRow) -> SendOutcome,
    private val signedIn: () -> Boolean = { true },
    private val online: () -> Boolean = { true },
    private val now: () -> Long = { System.currentTimeMillis() },
    private val random: () -> Double = { Math.random() },
    private val stillOurs: () -> Boolean = { true },
) {
    suspend fun drain(): DrainReport {
        var replayed = 0

        if (!signedIn() || !online()) return report(replayed)

        for (entry in queue.entries()) {
            // A changed identity is "stop", not "continue": the rows this run
            // would touch now belong to someone else.
            if (!stillOurs()) break
            if (entry.status == OutboxIntentRow.STATUS_FAILED) continue
            if (!OutboxRules.isDue(entry.status, entry.nextAttemptAt, now())) break
            if (!online()) break

            when (send(entry)) {
                SendOutcome.Accepted -> {
                    queue.remove(entry.seq)
                    replayed += 1
                }
                SendOutcome.Permanent ->
                    queue.patch(
                        entry = entry,
                        attempts = entry.attempts,
                        status = OutboxIntentRow.STATUS_FAILED,
                        lastError = "refused",
                        nextAttemptAt = entry.nextAttemptAt,
                    )
                SendOutcome.Transient -> {
                    val attempts = entry.attempts + 1
                    queue.patch(
                        entry = entry,
                        attempts = attempts,
                        status = OutboxIntentRow.STATUS_PENDING,
                        lastError = "unreachable",
                        nextAttemptAt = now() + OutboxRules.backoffDelay(attempts, random()),
                    )
                    break
                }
            }
        }

        return report(replayed)
    }

    private suspend fun report(replayed: Int): DrainReport {
        val entries = queue.entries()
        return DrainReport(
            replayed = replayed,
            pending = entries.count { it.status == OutboxIntentRow.STATUS_PENDING },
            failed = entries.count { it.status == OutboxIntentRow.STATUS_FAILED },
        )
    }
}
