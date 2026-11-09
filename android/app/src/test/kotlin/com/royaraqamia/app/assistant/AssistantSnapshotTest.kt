package com.royaraqamia.app.assistant

import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponseAllowance
import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponseAllowanceMember
import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponseAllowanceProject
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The face a kept page wears before the live read answers (ADR-0150).
 *
 * The order is the panel's: a deployment with no key is unavailable even for a
 * member who could otherwise ask, and a plan with no turn is the upgrade.
 */
class AssistantSnapshotTest {
    private fun snapshot(available: Boolean = true, cap: Double = 40.0) =
        AssistantSnapshot(
            threadId = "a-1",
            quota = null,
            messages = emptyList(),
            available = available,
            allowance =
                ChatAssistantStateResponseAllowance(
                    plan = "pro",
                    member = ChatAssistantStateResponseAllowanceMember(used = 0.0, cap = cap),
                    project = ChatAssistantStateResponseAllowanceProject(used = 0.0, limit = 900.0),
                    resetsAt = "2026-11-10T00:00:00.000Z",
                ),
        )

    @Test
    fun `a member who can ask opens on the conversation`() {
        assertEquals(AssistantUiState.Ready, snapshot().face())
    }

    @Test
    fun `a plan with no turn opens on the upgrade`() {
        assertEquals(AssistantUiState.Locked, snapshot(cap = 0.0).face())
    }

    @Test
    fun `a deployment with no key says so even when the plan allows a turn`() {
        assertEquals(AssistantUiState.Unavailable, snapshot(available = false).face())
    }

    @Test
    fun `no remembered allowance still opens on the conversation`() {
        val remembered = snapshot().copy(allowance = null)
        assertEquals(AssistantUiState.Ready, remembered.face())
    }
}
