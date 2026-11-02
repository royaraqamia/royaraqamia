package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.generated.AppFailureReportReason
import com.royaraqamia.app.store.outbox.DrainReport
import com.royaraqamia.app.sync.DrainDecision
import com.royaraqamia.app.sync.DrainOutcome

/**
 * Why a drain ended owing work (#667), as a class — the only thing about a failed
 * drain that leaves the device.
 *
 * Four classes, each one a different person's next step:
 *
 * - `no-session` — the refresh was refused, so the queue is waiting for a
 *   sign-in rather than for the network. The rows are not lost (ADR-0027).
 * - `refused` — the server answered no to a write it was sent. Something the app
 *   sends is no longer accepted, which is a release bug, not a tunnel.
 * - `abandoned` — the attempt budget ran out with work owed and no refusal to
 *   explain it: the writes stayed queued and the floor re-armed them.
 * - `unreachable` — attempts were made, nothing was refused, and work is still
 *   owed. The least alarming of the four, and still worth a trend.
 *
 * **Offline is not a failure.** `DrainDecision` reports work owed on a phone with
 * no radio on purpose, and reporting that would make every commute an incident.
 * The rule is therefore first: no report while the device has no network.
 */
enum class DrainFailureReason(val reason: AppFailureReportReason, val wire: String) {
    NO_SESSION(AppFailureReportReason.NO_SESSION, "no-session"),
    UNREACHABLE(AppFailureReportReason.UNREACHABLE, "unreachable"),
    REFUSED(AppFailureReportReason.REFUSED, "refused"),
    ABANDONED(AppFailureReportReason.ABANDONED, "abandoned"),
}

object DrainFailure {
    /**
     * The reason to file, or `null` when the drain does not have one.
     *
     * A refusal outranks the outcome: an abandoned drain whose rows were refused
     * is a contract problem, and saying "abandoned" would hide the one fact the
     * person needs. `pending` alone (with nothing refused) is `unreachable` until
     * the budget is spent, and `abandoned` after it.
     */
    fun of(decision: DrainDecision, signedIn: Boolean, online: Boolean): DrainFailureReason? {
        if (decision.outcome == DrainOutcome.Drained) return null
        if (!online) return null
        if (!signedIn) return DrainFailureReason.NO_SESSION
        return reasonOf(decision.report, decision.outcome)
    }

    /** The same rule over a bare report, for a caller that has no decision. */
    fun reasonOf(report: DrainReport, outcome: DrainOutcome): DrainFailureReason? = when {
        outcome == DrainOutcome.Drained -> null
        report.failed > 0 -> DrainFailureReason.REFUSED
        // Nothing owed: whatever ended the schedule, there is no work to explain.
        report.pending == 0 -> null
        outcome == DrainOutcome.Abandoned -> DrainFailureReason.ABANDONED
        else -> DrainFailureReason.UNREACHABLE
    }
}
