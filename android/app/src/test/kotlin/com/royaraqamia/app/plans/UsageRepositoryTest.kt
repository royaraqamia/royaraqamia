package com.royaraqamia.app.plans

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.Transport
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The card's read (#648, #501): one authorized GET, and the model it resolves to.
 *
 * The request is asserted as well as the answer, because the path is the part a
 * rename on the site silently breaks: `/api/me/usage` is the route the web's
 * `/account/plan` reads, and the app cannot discover a 404 by type.
 */
class UsageRepositoryTest {
    private val body =
        """
        {
          "success": true,
          "state": {
            "plan": "pro",
            "unlimited": false,
            "expiresAt": "2027-01-31T00:00:00.000Z",
            "counters": [
              { "key": "quran.surah.read", "label": "سور القرآن", "window": "lifetime",
                "cap": 10, "used": 4, "remaining": 6 }
            ]
          }
        }
        """.trimIndent()

    private fun repository(transport: Transport): UsageRepository {
        val session =
            runBlocking {
                Session(MemoryTokenStore("refresh-1"), TokenRefresher { RefreshOutcome.Refused })
                    .also { it.signIn(TokenPair("access-1", "refresh-1")) }
            }
        return UsageRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `one authorized read becomes the card's model`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport).load() }

        assertTrue(result is ApiResult.Success)
        val model = (result as ApiResult.Success).value
        assertEquals("pro", model.plan)
        assertEquals(4L, model.counters.single().used)
        assertEquals(6L, model.counters.single().remaining)

        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://app.test/api/me/usage", request.url)
        assertEquals("Bearer access-1", request.bearer)
    }

    @Test
    fun `a failed read keeps the reason`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(500, "boom") }).load()
            }

        assertEquals(ApiResult.Failure(ApiError.Server(500, "boom")), result)
    }
}
