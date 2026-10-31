package com.royaraqamia.app.connectedapps

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
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The connected-apps read and revoke, against the site's two routes (#657).
 *
 * The repository reads the same body the page reads and asks the same two paths,
 * so the app cannot list what the page would refuse to show or revoke something the
 * page keeps — one route per surface (ADR-0098).
 */
class ConnectedAppsRepositoryTest {
    private val listBody =
        """
        {
          "success": true,
          "data": [
            { "clientId": "client-1", "clientName": "Claude Code",
              "connectedAt": "2026-10-01T09:00:00.000Z", "lastUsedAt": null },
            { "clientId": "client-2", "clientName": null,
              "connectedAt": "2026-10-02T09:00:00.000Z", "lastUsedAt": "2026-10-20T09:00:00.000Z" }
          ]
        }
        """.trimIndent()

    private fun repository(transport: RecordingTransport): ConnectedAppsRepository {
        val session =
            runBlocking {
                Session(MemoryTokenStore("refresh-1"), TokenRefresher { RefreshOutcome.Refused }, MemoryIdentityStorage())
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return ConnectedAppsRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `the list maps every client the page would list`() {
        val transport = RecordingTransport { HttpResponse(200, listBody) }

        val result = runBlocking { repository(transport).list() }

        val apps = (result as ApiResult.Success).value
        assertEquals(listOf("client-1", "client-2"), apps.map { it.clientId })
        assertEquals("Claude Code", apps[0].name)
        assertEquals(null, apps[1].name)
        assertEquals("2026-10-20T09:00:00.000Z", apps[1].lastUsedAt)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/me/mcp/connected-apps", transport.requests.single().url)
    }

    @Test
    fun `a refused body is a failure, not an empty list`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(200, """{"success":false,"error":"nope"}""") })
                    .list()
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "nope")), result)
    }

    @Test
    fun `no session is a sign-in, not a failure`() {
        val repository = ConnectedAppsRepository(ApiClient("https://app.test", runBlocking { Session(MemoryTokenStore("r"), TokenRefresher { RefreshOutcome.Refused }, MemoryIdentityStorage()) }))

        val result = runBlocking { repository.list() }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertEquals(ConnectedAppsUiState.SignedOut, ConnectedAppsUiState.from(result))
    }

    @Test
    fun `a disconnect asks the client's own path and reports what the server said`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        val result = runBlocking { repository(transport).disconnect("client-1") }

        assertTrue(result is ApiResult.Success)
        assertEquals("DELETE", transport.requests.single().method)
        assertEquals("https://app.test/api/me/mcp/connected-apps/client-1", transport.requests.single().url)
    }

    @Test
    fun `a refused disconnect keeps the reason`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(200, """{"success":false,"error":"gone"}""") })
                    .disconnect("client-1")
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "gone")), result)
    }

    @Test
    fun `the card's states come from the read`() {
        val apps = listOf(ConnectedApp("client-1", "Claude Code", "2026-10-01T09:00:00.000Z", null))

        assertEquals(ConnectedAppsUiState.Ready(apps), ConnectedAppsUiState.from(ApiResult.Success(apps)))
        assertEquals(
            ConnectedAppsUiState.Failed,
            ConnectedAppsUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
        assertEquals(true, ConnectedAppsUiState.Ready(emptyList()).isEmpty)
    }
}
