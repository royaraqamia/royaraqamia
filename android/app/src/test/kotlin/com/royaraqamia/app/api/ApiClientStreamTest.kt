package com.royaraqamia.app.api

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.StreamAnswer
import com.royaraqamia.app.net.StreamTransport
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger

/**
 * The one streamed request (ADR-0143): the bearer, the `data:` frames, and the
 * same one-refresh rule the buffered client keeps.
 */
class ApiClientStreamTest {
    private val baseUrl = "https://app.test"
    private val turnUrl = "$baseUrl/api/chats/c-1/assistant"

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
            Session(MemoryTokenStore("refresh-1"), refresher, MemoryIdentityStorage()).also {
                it.signIn(TokenPair(accessToken, "refresh-1", "user-1"))
            }
        }

    @Test
    fun `the frames reach the caller with the bearer and the route's body`() {
        val frames = mutableListOf<String>()
        val headers = mutableMapOf<String, String>()
        val stream =
            StreamTransport { url, sentHeaders, body, onData ->
                assertEquals(turnUrl, url)
                headers.putAll(sentHeaders)
                assertEquals("""{"body":"مرحباً"}""", body)
                onData("""{"type":"delta","text":"أهلاً"}""")
                onData("""{"type":"done"}""")
                StreamAnswer(200)
            }
        val client =
            ApiClient(
                baseUrl,
                signedIn(CountingRefresher { RefreshOutcome.Refused }),
                RecordingTransport { error("the buffered transport is not this route") },
                stream,
            )

        val result = runBlocking {
            client.streamPost("/api/chats/c-1/assistant", """{"body":"مرحباً"}""") { frames += it }
        }

        assertTrue(result is ApiResult.Success)
        assertEquals(listOf("""{"type":"delta","text":"أهلاً"}""", """{"type":"done"}"""), frames)
        assertEquals("Bearer access-1", headers["Authorization"])
        assertEquals("application/json", headers["Content-Type"])
    }

    @Test
    fun `a 401 refreshes once and retries with the new token`() {
        val refresher =
            CountingRefresher {
                RefreshOutcome.Renewed(TokenPair("access-2", "refresh-2", "user-1"))
            }
        var calls = 0
        val tokens = mutableListOf<String>()
        val stream =
            StreamTransport { _, headers, _, _ ->
                calls += 1
                tokens += headers.getValue("Authorization")
                if (headers["Authorization"] == "Bearer access-2") StreamAnswer(200)
                else StreamAnswer(401)
            }
        val client =
            ApiClient(baseUrl, signedIn(refresher), RecordingTransport { error("unused") }, stream)

        val result = runBlocking { client.streamPost("/api/chats/c-1/assistant", "{}") {} }

        assertTrue(result is ApiResult.Success)
        assertEquals(listOf("Bearer access-1", "Bearer access-2"), tokens)
        assertEquals(2, calls)
        assertEquals(1, refresher.calls.get())
    }

    @Test
    fun `a refusal is the server's sentence, not a thrown error`() {
        val stream =
            StreamTransport { _, _, _, _ ->
                StreamAnswer(429, """{"error":"نور مشغولة الآن، حاول بعد قليل."}""")
            }
        val client =
            ApiClient(
                baseUrl,
                signedIn(CountingRefresher { RefreshOutcome.Refused }),
                RecordingTransport { error("unused") },
                stream,
            )

        val result = runBlocking { client.streamPost("/api/chats/c-1/assistant", "{}") {} }

        assertTrue(result is ApiResult.Failure)
        val error = (result as ApiResult.Failure).error
        assertTrue(error is ApiError.Server)
        assertEquals(429, (error as ApiError.Server).status)
    }

    @Test
    fun `an unreachable socket is a network answer`() {
        val stream =
            StreamTransport { _, _, _, _ -> throw IOException("no route to host") }
        val client =
            ApiClient(
                baseUrl,
                signedIn(CountingRefresher { RefreshOutcome.Refused }),
                RecordingTransport { error("unused") },
                stream,
            )

        val result = runBlocking { client.streamPost("/api/chats/c-1/assistant", "{}") {} }

        assertTrue(result is ApiResult.Failure)
        assertTrue((result as ApiResult.Failure).error is ApiError.Network)
    }
}
