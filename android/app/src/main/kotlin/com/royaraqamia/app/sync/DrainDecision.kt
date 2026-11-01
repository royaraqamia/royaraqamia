package com.royaraqamia.app.sync

import com.royaraqamia.app.store.outbox.DrainReport

/** What the scheduler should do with the run that just finished. */
enum class DrainOutcome {
    /** Nothing is owed any more: the schedule is done. */
    Drained,

    /** Work is still owed, and the attempt budget has room: come back. */
    Retry,

    /** Work is still owed and the attempts are spent: end this schedule. */
    Abandoned,
}

/**
 * What one background drain came to, and what the worker should do about it
 * (#651).
 *
 * The rules are the shell's own, kept and made native rather than re-invented:
 *
 * - **The default is "come back".** A queue the worker could not drain is the
 *   user's write, and retiring it would be a silent loss; only "nothing is
 *   owed" ends a schedule.
 * - **A permanent refusal is not a reason to retry.** `failed` intents are kept
 *   for the sync pill to surface and a retry from the screen; the background
 *   path cannot fix them by asking again.
 * - **Giving up does not drop anything.** After [MAX_ATTEMPTS] the schedule
 *   ends, the rows stay in the store, and the 15-minute floor re-arms it. The
 *   attempt count bounds *this* run of the schedule, not the write's life.
 *
 * Pure, so the JVM suite pins the decision without WorkManager, a database or a
 * network (`DrainDecisionTest`).
 */
data class DrainDecision(
    val outcome: DrainOutcome,
    val summary: String,
    val report: DrainReport,
) {
    val retry: Boolean
        get() = outcome == DrainOutcome.Retry

    companion object {
        /**
         * The attempts one schedule may spend. Five is what the shell used, and
         * it is short on purpose: with WorkManager's exponential backoff it
         * reaches roughly four minutes, which is a phone's tunnel and not an
         * afternoon offline.
         */
        const val MAX_ATTEMPTS = 5

        /**
         * The decision after a drain, or after one that could not be attempted.
         *
         * [why] names the condition a caller already knows — "no session", say —
         * so the log line explains a pending count a reader would otherwise
         * attribute to the network.
         */
        fun of(report: DrainReport, attempt: Int, why: String? = null): DrainDecision {
            val reason =
                listOfNotNull(why, "${report.pending} intent(s) still queued").joinToString("; ")
            val summary = when {
                report.pending == 0 -> "drained (failed=${report.failed})"
                attempt >= MAX_ATTEMPTS ->
                    "gave up after $attempt attempt(s): $reason (the write stays queued)"
                else -> "queued another attempt: $reason"
            }

            val outcome = when {
                report.pending == 0 -> DrainOutcome.Drained
                attempt >= MAX_ATTEMPTS -> DrainOutcome.Abandoned
                else -> DrainOutcome.Retry
            }

            return DrainDecision(outcome = outcome, summary = summary, report = report)
        }
    }
}
