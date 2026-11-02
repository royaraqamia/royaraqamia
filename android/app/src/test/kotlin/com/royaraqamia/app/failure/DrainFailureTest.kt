package com.royaraqamia.app.failure

import com.royaraqamia.app.store.outbox.DrainReport
import com.royaraqamia.app.sync.DrainDecision
import com.royaraqamia.app.sync.DrainOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * When a drain is worth reporting, and which class it is (#667).
 *
 * The first rule is the one that keeps the feature honest: a phone with no radio
 * owes work on purpose, and reporting that would make every commute an incident.
 */
class DrainFailureTest {
    private fun decision(
        replayed: Int = 0,
        pending: Int = 0,
        failed: Int = 0,
        attempt: Int = 0,
        why: String? = null,
    ): DrainDecision = DrainDecision.of(DrainReport(replayed, pending, failed), attempt, why)

    private fun reason(decision: DrainDecision, signedIn: Boolean = true, online: Boolean = true) =
        DrainFailure.of(decision, signedIn = signedIn, online = online)

    @Test
    fun `a drained queue is not a failure`() {
        assertNull(reason(decision(replayed = 3, failed = 1)))
    }

    @Test
    fun `no radio is not a failed drain`() {
        assertNull(reason(decision(pending = 2), online = false))
        assertNull(reason(decision(pending = 2), signedIn = false, online = false))
    }

    @Test
    fun `a refused refresh is a session problem, not a network one`() {
        assertEquals(DrainFailureReason.NO_SESSION, reason(decision(pending = 2), signedIn = false))
    }

    @Test
    fun `a write the server refused is a refusal, however the drain ended`() {
        assertEquals(DrainFailureReason.REFUSED, reason(decision(pending = 1, failed = 2)))
        assertEquals(
            DrainFailureReason.REFUSED,
            reason(decision(pending = 1, failed = 2, attempt = DrainDecision.MAX_ATTEMPTS)),
        )
    }

    @Test
    fun `work owed when the budget ran out is abandoned`() {
        assertEquals(
            DrainFailureReason.ABANDONED,
            reason(decision(pending = 2, attempt = DrainDecision.MAX_ATTEMPTS)),
        )
    }

    @Test
    fun `work still owed on a signed-in online device is unreachable`() {
        assertEquals(DrainFailureReason.UNREACHABLE, reason(decision(pending = 2)))
    }

    @Test
    fun `a give-up with nothing owed and nothing refused has no class`() {
        assertNull(
            DrainFailure.reasonOf(DrainReport(0, 0, 0), DrainOutcome.Abandoned),
        )
    }

    @Test
    fun `the wire values are the contract's own`() {
        assertEquals("no-session", DrainFailureReason.NO_SESSION.wire)
        assertEquals("unreachable", DrainFailureReason.UNREACHABLE.wire)
        assertEquals("refused", DrainFailureReason.REFUSED.wire)
        assertEquals("abandoned", DrainFailureReason.ABANDONED.wire)
    }
}
