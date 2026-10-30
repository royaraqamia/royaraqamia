package com.royaraqamia.app.api

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.McpConnectedAppActionResult
import com.royaraqamia.app.contracts.generated.MyUsageResponse
import com.royaraqamia.app.contracts.generated.MyUsageResponseStatePlan
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

/**
 * The bearer path to an owned route (#501): what a screen's read sends, and the
 * one refresh a 401 is allowed.
 *
 * The 401 tests are the point of the class. A client that refreshes per request
 * spends a rotated token it does not get back — GoTrue mints each refresh token
 * once — and one that retries forever turns an expired session into a request
 * loop. Neither is visible without an answer that looks like the real one, so
 * the transport here answers.
 */
class ApiClientTest {
    private val baseUrl = "https://app.test"
    private val usageUrl = "$baseUrl/api/me/usage"

    private val usageBody =
        """
        {
          "success": true,
          "state": {
            "plan": "free",
            "unlimited": false,
            "expiresAt": null,
            "counters": []
          }
        }
        """.trimIndent()

    private class CountingRefresher(private val outcome: () -> RefreshOutcome) : TokenRefresher {
        val calls = AtomicInteger()

        override suspend fun refresh(refreshToken: String): RefreshOutcome {
            calls.incrementAndGet()
            delay(10)
            return outcome()
        }
    }

    private fun signedIn(refresher: TokenRefresher, accessToken: String = "access-1"): Session =
        runBlocking {
            Session(MemoryTokenStore("refresh-1"), refresher).also {
                it.signIn(TokenPair(accessToken, "refresh-1"))
            }
        }

    @Test
    fun `a 200 decodes through the generated contract`() {
        val transport = RecordingTransport { HttpResponse(200, usageBody) }
        val client = ApiClient(baseUrl, signedIn(CountingRefresher { RefreshOutcome.Refused }), transport)

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertTrue(result is ApiResult.Success)
        assertEquals(MyUsageResponseStatePlan.FREE, (result as ApiResult.Success).value.state.plan)

        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals(usageUrl, request.url)
        assertEquals("Bearer access-1", request.bearer)
    }

    @Test
    fun `a 401 refreshes once and retries with the new token`() {
        val refresher = CountingRefresher { RefreshOutcome.Renewed(TokenPair("access-2", "refresh-2")) }
        val transport =
            RecordingTransport { request ->
                if (request.bearer == "Bearer access-2") HttpResponse(200, usageBody)
                else HttpResponse(401, "")
            }
        val client = ApiClient(baseUrl, signedIn(refresher), transport)

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertTrue("the retry carries the refreshed token", result is ApiResult.Success)
        assertEquals(2, transport.hits)
        assertEquals("Bearer access-2", transport.requests.last().bearer)
        assertEquals(1, refresher.calls.get())
    }

    @Test
    fun `a second 401 is a sign-in, not a loop`() {
        val refresher = CountingRefresher { RefreshOutcome.Renewed(TokenPair("access-2", "refresh-2")) }
        val transport = RecordingTransport { HttpResponse(401, "") }
        val client = ApiClient(baseUrl, signedIn(refresher), transport)

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertEquals("sent, refreshed, retried, stopped", 2, transport.hits)
        assertEquals(1, refresher.calls.get())
    }

    @Test
    fun `a request with no token is never sent`() {
        val transport = RecordingTransport { HttpResponse(200, usageBody) }
        val session = Session(MemoryTokenStore(), CountingRefresher { RefreshOutcome.Refused })
        val client = ApiClient(baseUrl, session, transport)

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertEquals(0, transport.hits)
    }

    @Test
    fun `a server answer is surfaced with its status`() {
        val client =
            ApiClient(
                baseUrl,
                signedIn(CountingRefresher { RefreshOutcome.Refused }),
                RecordingTransport { HttpResponse(503, "maintenance") },
            )

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertEquals(ApiResult.Failure(ApiError.Server(503, "maintenance")), result)
    }

    @Test
    fun `an unreachable server is a network failure, not a sign-out`() {
        val refresher = CountingRefresher { RefreshOutcome.Refused }
        val session = signedIn(refresher)
        val client =
            ApiClient(baseUrl, session, RecordingTransport { throw IOException("connection refused") })

        val result = runBlocking { client.get<MyUsageResponse>("/api/me/usage") }

        assertEquals(ApiResult.Failure(ApiError.Network("connection refused")), result)
        assertTrue("the session survives a dead network", session.signedIn)
        assertEquals("an unreachable server asks for no refresh", 0, refresher.calls.get())
    }

    @Test
    fun `a delete sends the method the route dispatches on`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }
        val client = ApiClient(baseUrl, signedIn(CountingRefresher { RefreshOutcome.Refused }), transport)

        val result = runBlocking {
            client.delete<McpConnectedAppActionResult>("/api/me/mcp/connected-apps/client-1")
        }

        assertTrue(result is ApiResult.Success)
        assertEquals(true, (result as ApiResult.Success).value.success)

        val request = transport.requests.single()
        assertEquals("DELETE", request.method)
        assertEquals("$baseUrl/api/me/mcp/connected-apps/client-1", request.url)
        assertEquals("Bearer access-1", request.bearer)
    }

    @Test
    fun `a revoked session answers a delete as a sign-in, not a retry loop`() {
        val refresher = CountingRefresher { RefreshOutcome.Refused }
        val transport =
            RecordingTransport { request ->
                if (request.bearer == "Bearer access-1") HttpResponse(401, "expired")
                else HttpResponse(401, "still expired")
            }
        val client = ApiClient(baseUrl, signedIn(refresher), transport)

        val result = runBlocking { client.delete<McpConnectedAppActionResult>("/api/me/x") }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertEquals("one refresh, never two", 1, refresher.calls.get())
    }
}
