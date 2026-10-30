package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The card's four states (#647), from a settled read.
 *
 * The branch that matters is the one that is not an error: a missing session is a
 * sign-in prompt, not a failure, because a guest can act on it and cannot act on a
 * 500. Every other failure is the same state, and the card draws the site's one
 * sentence and one retry for it.
 */
class UsageUiStateTest {
    private val model =
        UsageScreenModel(
            plan = "free",
            unlimited = false,
            expiresAt = null,
            rows = emptyList(),
            activations = emptyList(),
        )

    @Test
    fun `a read becomes the counters`() {
        assertEquals(UsageUiState.Ready(model), UsageUiState.from(ApiResult.Success(model)))
    }

    @Test
    fun `no session is a sign-in, not a failure`() {
        assertEquals(
            UsageUiState.SignedOut,
            UsageUiState.from(ApiResult.Failure(ApiError.NotSignedIn)),
        )
    }

    @Test
    fun `an unreachable server is a retry`() {
        assertEquals(
            UsageUiState.Failed,
            UsageUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
    }

    @Test
    fun `a server error and a drifted body read the same way`() {
        val failures =
            listOf(
                ApiError.Server(503, "maintenance"),
                ApiError.Server(500, "boom"),
                ApiError.InvalidContract("state.counters", "missing"),
            )

        for (error in failures) {
            assertEquals(
                "a member acts the same way on $error",
                UsageUiState.Failed,
                UsageUiState.from(ApiResult.Failure(error)),
            )
        }
    }
}
