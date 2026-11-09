package com.royaraqamia.app.account

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The allowance card's faces (#947), from a settled read.
 *
 * A missing session is `Hidden` because the page renders no card at all for a
 * visitor; every other failure is the one sentence and retry the card draws.
 */
class AccountUsageUiStateTest {
    private val usage = AccountUsage(plan = "free", unlimited = false)

    @Test
    fun `a read becomes the plan in force`() {
        assertEquals(
            AccountUsageUiState.Ready(plan = usage.plan, unlimited = usage.unlimited),
            AccountUsageUiState.from(ApiResult.Success(usage)),
        )
    }

    @Test
    fun `no session hides the card the way the page hides it`() {
        assertEquals(
            AccountUsageUiState.Hidden,
            AccountUsageUiState.from(ApiResult.Failure(ApiError.NotSignedIn)),
        )
    }

    @Test
    fun `an unreachable server is a retry`() {
        assertEquals(
            AccountUsageUiState.Failed,
            AccountUsageUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
    }

    @Test
    fun `a server error and a drifted body read the same way`() {
        val failures =
            listOf(
                ApiError.Server(503, "maintenance"),
                ApiError.Server(500, "boom"),
                ApiError.InvalidContract("state.plan", "missing"),
            )

        for (error in failures) {
            assertEquals(
                "a member acts the same way on $error",
                AccountUsageUiState.Failed,
                AccountUsageUiState.from(ApiResult.Failure(error)),
            )
        }
    }
}
