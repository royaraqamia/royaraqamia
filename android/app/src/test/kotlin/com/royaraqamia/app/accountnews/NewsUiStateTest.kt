package com.royaraqamia.app.accountnews

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The screen's settled reads become the states its cards draw (#950).
 *
 * A missing session is a sign-in prompt on the checklist and nothing at all on
 * the one list, which is the distinction the page draws.
 */
class NewsUiStateTest {
    private val selection =
        NewsSelection(
            sources = listOf(NewsSource("tech-daily", "تقنية اليوم", "tech", "arab")),
            selected = setOf("tech-daily"),
        )

    private val summary =
        NewsOwnedSources(
            rows = emptyList(),
            limited = false,
            cap = 0,
            used = 0,
        )

    @Test
    fun `a checklist read becomes its rows`() {
        assertEquals(
            NewsPreferencesUiState.Ready(
                sources = selection.sources,
                selected = selection.selected,
            ),
            NewsPreferencesUiState.from(ApiResult.Success(selection)),
        )
    }

    @Test
    fun `no session is the checklist's sign-in, not its failure`() {
        assertEquals(
            NewsPreferencesUiState.SignedOut,
            NewsPreferencesUiState.from(ApiResult.Failure(ApiError.NotSignedIn)),
        )
        assertEquals(
            NewsPreferencesUiState.Failed,
            NewsPreferencesUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
    }

    @Test
    fun `the one list's read becomes its summary`() {
        assertEquals(
            NewsPrivateSourcesUiState.Ready(summary),
            NewsPrivateSourcesUiState.from(ApiResult.Success(summary)),
        )
        assertEquals(
            NewsPrivateSourcesUiState.Failed,
            NewsPrivateSourcesUiState.from(ApiResult.Failure(ApiError.Server(500, "boom"))),
        )
    }
}
