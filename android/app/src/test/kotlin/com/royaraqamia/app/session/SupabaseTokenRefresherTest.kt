package com.royaraqamia.app.session

import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.support.SentRequest
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The GoTrue refresh call's policy (#501).
 *
 * What matters to the session is not the JSON shape but which answers count as
 * "this token is spent" and which do not: a 400/401/403 is a refusal that ends
 * the session, a 5xx or an unreadable body is not, because the token may still
 * be perfectly good.
 */
class SupabaseTokenRefresherTest {
    private val authUrl = "https://project.supabase.co/auth/v1"

    private fun refresher(answer: (SentRequest) -> HttpResponse) =
        SupabaseTokenRefresher(authUrl, apiKey = "anon-key", transport = RecordingTransport(answer))

    @Test
    fun `a 200 renews the pair and asks the question GoTrue expects`() = runBlocking {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """{"access_token":"access-2","refresh_token":"refresh-2","expires_in":3600}""",
                )
            }

        val outcome = SupabaseTokenRefresher(authUrl, "anon-key", transport).refresh("refresh-1")

        assertTrue(outcome is RefreshOutcome.Renewed)
        assertEquals("access-2", (outcome as RefreshOutcome.Renewed).pair.accessToken)
        assertEquals("refresh-2", outcome.pair.refreshToken)

        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals("$authUrl/token?grant_type=refresh_token", request.url)
        assertEquals("anon-key", request.headers["apikey"])
        assertTrue("the token travels in the body", request.body.orEmpty().contains("\"refresh-1\""))
    }

    @Test
    fun `a spent token is a refusal`() = runBlocking {
        for (status in listOf(400, 401, 403)) {
            val outcome =
                refresher { HttpResponse(status, """{"error":"invalid_grant"}""") }.refresh("refresh-1")
            assertEquals("HTTP $status", RefreshOutcome.Refused, outcome)
        }
    }

    @Test
    fun `a 5xx keeps the token`() = runBlocking {
        assertEquals(
            RefreshOutcome.Unreachable("auth answered 503"),
            refresher { HttpResponse(503, "upstream") }.refresh("refresh-1"),
        )
    }

    @Test
    fun `a body this client cannot read keeps the token`() = runBlocking {
        val outcome =
            refresher { HttpResponse(200, """{"token_type":"bearer"}""") }.refresh("refresh-1")

        assertTrue(outcome is RefreshOutcome.Unreachable)
    }
}
