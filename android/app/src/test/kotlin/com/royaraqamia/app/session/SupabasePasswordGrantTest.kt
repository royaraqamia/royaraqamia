package com.royaraqamia.app.session

import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.support.SentRequest
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * The password grant's policy (#501).
 *
 * The distinction that matters is the one a user feels: a 400 is "wrong email or
 * password" and wants the form again, while a 5xx or a dead socket is not the
 * user's fault and must not be reported as one. Both are `SignInOutcome`, so a
 * screen can tell them apart without parsing an error body.
 */
class SupabasePasswordGrantTest {
    private val authUrl = "https://project.supabase.co/auth/v1"

    private fun grant(answer: (SentRequest) -> HttpResponse) =
        SupabasePasswordGrant(authUrl, apiKey = "anon-key", transport = RecordingTransport(answer))

    @Test
    fun `a 200 mints the pair and asks GoTrue for a password grant`() = runBlocking {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """{"access_token":"access-1","refresh_token":"refresh-1","expires_in":3600}""",
                )
            }

        val outcome = SupabasePasswordGrant(authUrl, "anon-key", transport).signIn("a@b.test", "s3cret")

        assertEquals(SignInOutcome.SignedIn(TokenPair("access-1", "refresh-1")), outcome)

        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals("$authUrl/token?grant_type=password", request.url)
        assertEquals("anon-key", request.headers["apikey"])
        assertTrue(request.body.orEmpty().contains("\"a@b.test\""))
        assertTrue(request.body.orEmpty().contains("\"s3cret\""))
    }

    @Test
    fun `bad credentials are a refusal, not an outage`() = runBlocking {
        for (status in listOf(400, 401, 403)) {
            val outcome = grant { HttpResponse(status, """{"error":"invalid_grant"}""") }
                .signIn("a@b.test", "wrong")

            assertEquals("HTTP $status", SignInOutcome.Refused, outcome)
        }
    }

    @Test
    fun `a 5xx is unreachable`() = runBlocking {
        assertEquals(
            SignInOutcome.Unreachable("auth answered 503"),
            grant { HttpResponse(503, "upstream") }.signIn("a@b.test", "s3cret"),
        )
    }

    @Test
    fun `a dead socket is unreachable`() = runBlocking {
        val outcome =
            grant { throw IOException("connection refused") }.signIn("a@b.test", "s3cret")

        assertEquals(SignInOutcome.Unreachable("connection refused"), outcome)
    }

    @Test
    fun `a body this client cannot read is unreachable, not a refusal`() = runBlocking {
        val outcome =
            grant { HttpResponse(200, """{"token_type":"bearer"}""") }.signIn("a@b.test", "s3cret")

        assertTrue(outcome is SignInOutcome.Unreachable)
    }
}
