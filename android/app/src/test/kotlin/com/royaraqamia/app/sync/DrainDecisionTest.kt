package com.royaraqamia.app.sync

import com.royaraqamia.app.store.habitflow.DrainReport
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a background drain decides after it ran (#651).
 *
 * These are the cases a device would take a day to reach, and the ones where
 * being wrong is silent: a queue that still owes work and is answered "done" is
 * a write the user made and never sees again, while one that gives up too early
 * spends the battery on a schedule that answers nothing.
 */
class DrainDecisionTest {

    private fun report(pending: Int, failed: Int = 0, replayed: Int = 0) =
        DrainReport(replayed = replayed, pending = pending, failed = failed)

    @Test
    fun anEmptyQueueIsDone() {
        val decision = DrainDecision.of(report(pending = 0), attempt = 0)

        assertEquals(DrainOutcome.Drained, decision.outcome)
        assertFalse(decision.retry)
        assertEquals("drained (failed=0)", decision.summary)
    }

    @Test
    fun aPermanentRefusalIsSurfacedRatherThanRetried() {
        // Nothing is owed any more: the server refused the intent and the row is
        // kept as `failed` for the pill, which is a retry from the screen and not
        // something a background wake can fix by asking again.
        val decision = DrainDecision.of(report(pending = 0, failed = 2), attempt = 0)

        assertEquals(DrainOutcome.Drained, decision.outcome)
        assertEquals("drained (failed=2)", decision.summary)
    }

    @Test
    fun workStillOwedComesBack() {
        val decision = DrainDecision.of(report(pending = 1, replayed = 3), attempt = 0)

        assertEquals(DrainOutcome.Retry, decision.outcome)
        assertTrue(decision.retry)
        assertEquals("queued another attempt: 1 intent(s) still queued", decision.summary)
    }

    @Test
    fun theAttemptBudgetEndsTheScheduleAndSaysSo() {
        val last = DrainDecision.of(report(pending = 1), attempt = DrainDecision.MAX_ATTEMPTS - 1)
        val spent = DrainDecision.of(report(pending = 1), attempt = DrainDecision.MAX_ATTEMPTS)

        assertEquals(DrainOutcome.Retry, last.outcome)
        assertEquals(DrainOutcome.Abandoned, spent.outcome)
        assertFalse(spent.retry)
        // The words matter: whoever reads logcat has to learn the write is not lost.
        assertTrue(spent.summary.contains("the write stays queued"))
    }

    @Test
    fun noSessionIsNamedAsTheReasonTheRunDidNothing() {
        // A drain that never started is not the network's fault, and a reader
        // looking at a pending count deserves to be told which it was.
        val decision = DrainDecision.of(report(pending = 2), attempt = 0, why = "no session to send with")

        assertEquals(DrainOutcome.Retry, decision.outcome)
        assertEquals(
            "queued another attempt: no session to send with; 2 intent(s) still queued",
            decision.summary,
        )
    }

    @Test
    fun aRefusedSessionStillEndsAfterTheBudget() {
        val decision =
            DrainDecision.of(
                report(pending = 2),
                attempt = DrainDecision.MAX_ATTEMPTS,
                why = "no session to send with",
            )

        assertEquals(DrainOutcome.Abandoned, decision.outcome)
        assertTrue(decision.summary.startsWith("gave up after 5 attempt(s): no session to send with"))
    }

    @Test
    fun theBudgetIsTheShellsOwn() {
        // ADR-0059's floor: five attempts on WorkManager's exponential backoff,
        // which is minutes rather than an afternoon.
        assertEquals(5, DrainDecision.MAX_ATTEMPTS)
    }
}
