package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The allowance card's read (#947), against the route the page's `UsageCard`
 * reads.
 *
 * One route per surface (ADR-0098): the card does not read the plan page's
 * `/api/me/plan`, so this holds the path and the two facts it takes from the body.
 */
class AccountUsageRepositoryTest {
    private fun repository(transport: RecordingTransport): AccountUsageRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return AccountUsageRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `the card reads the page's usage route and keeps the plan`() {
        val body =
            """
            {"success":true,"state":{"plan":"free","unlimited":false,"expiresAt":null,"counters":[]}}
            """.trimIndent()
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport).load() }

        assertEquals(ApiResult.Success(AccountUsage(plan = "free", unlimited = false)), result)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/me/usage", transport.requests.single().url)
    }

    @Test
    fun `an unlimited plan is the same read`() {
        val body =
            """
            {"success":true,"state":{"plan":"pro","unlimited":true,"expiresAt":null,"counters":[]}}
            """.trimIndent()

        val result =
            runBlocking { repository(RecordingTransport { HttpResponse(200, body) }).load() }

        assertEquals(ApiResult.Success(AccountUsage(plan = "pro", unlimited = true)), result)
    }

    @Test
    fun `a failed read is passed through, not turned into an empty plan`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(503, """{"error":"maintenance"}""") }).load()
            }

        assertEquals(
            ApiResult.Failure(ApiError.Server(503, """{"error":"maintenance"}""")),
            result,
        )
    }
}
