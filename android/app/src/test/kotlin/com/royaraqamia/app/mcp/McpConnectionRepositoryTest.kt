package com.royaraqamia.app.mcp

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
 * The connection screen's routes (#1256).
 *
 * The app must read and write what the page does: the same detail route, the same
 * one-field `PATCH` bodies, the same tool switch, and the same revoke. A 404 is
 * the connection's own answer and must not be drawn as an outage — that is the
 * difference [ConnectionUiState] exists for.
 */
class McpConnectionRepositoryTest {
    private val detailBody =
        """
        {
          "success": true,
          "data": {
            "id": "conn-1", "registryName": "acme/mcp", "displayName": null,
            "enabled": true, "permissionLevel": "reads", "status": "active",
            "authMode": "oauth", "toolCount": 1,
            "connectedAt": "2026-11-01T09:00:00.000Z", "lastUsedAt": null,
            "lastError": null, "scopes": ["read"],
            "tools": [
              { "name": "search", "description": "Find things", "readOnly": true,
                "enabled": true, "stale": false }
            ]
          }
        }
        """.trimIndent()

    private fun session(): Session =
        runBlocking {
            Session(
                    MemoryTokenStore("refresh-1"),
                    TokenRefresher { RefreshOutcome.Refused },
                    MemoryIdentityStorage(),
                )
                .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    private fun repository(transport: RecordingTransport): McpConnectionRepository =
        McpConnectionRepository(ApiClient("https://app.test", session(), transport))

    @Test
    fun `the detail asks the page's own route and maps the grant`() {
        val transport = RecordingTransport { HttpResponse(200, detailBody) }

        val result = runBlocking { repository(transport).detail("conn-1") }

        val detail = (result as ApiResult.Success).value
        assertEquals("acme/mcp", detail.name)
        assertEquals(MarketplacePermission.READS, detail.permission)
        assertEquals(listOf("read"), detail.scopes)
        assertEquals("search", detail.tools.single().name)
        assertEquals(true, detail.tools.single().readOnly)
        assertEquals("https://app.test/api/me/mcp/connections/conn-1", transport.requests.single().url)
    }

    @Test
    fun `a connection that is not the member's is their own answer, not an outage`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(404, """{"success":false,"error":"gone"}""") })
                    .detail("conn-9")
            }

        assertEquals(ConnectionUiState.NotFound, ConnectionUiState.from(result))
        assertEquals(true, ConnectionUiState.from(ApiResult.Success(detailOf())) is ConnectionUiState.Ready)
    }

    @Test
    fun `an unreachable server is offline, not not-found`() {
        val state =
            ConnectionUiState.from(ApiResult.Failure(ApiError.Network("no radio")))

        assertEquals(ConnectionUiState.Offline, state)
    }

    @Test
    fun `the permission edit sends one field`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        val result = runBlocking {
            repository(transport).setPermission("conn-1", MarketplacePermission.READS)
        }

        assertTrue(result is ApiResult.Success)
        assertEquals("PATCH", transport.requests.single().method)
        assertEquals("""{"permissionLevel":"reads"}""", transport.requests.single().body)
    }

    @Test
    fun `the enabled switch is its own write`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        runBlocking { repository(transport).setEnabled("conn-1", false) }

        assertEquals("""{"enabled":false}""", transport.requests.single().body)
    }

    @Test
    fun `a tool switch asks the tools route by name`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        runBlocking { repository(transport).setTool("conn-1", "search", false) }

        assertEquals(
            "https://app.test/api/me/mcp/connections/conn-1/tools",
            transport.requests.single().url,
        )
        assertEquals("""{"toolName":"search","enabled":false}""", transport.requests.single().body)
    }

    @Test
    fun `a refused switch keeps the server's sentence`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport { HttpResponse(200, """{"success":false,"error":"رفض"}""") }
                    )
                    .setTool("conn-1", "search", true)
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "رفض")), result)
    }

    @Test
    fun `the revoke asks the connection's own route`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        val result = runBlocking { repository(transport).disconnect("conn-1") }

        assertTrue(result is ApiResult.Success)
        assertEquals("DELETE", transport.requests.single().method)
        assertEquals("https://app.test/api/me/mcp/connections/conn-1", transport.requests.single().url)
    }

    private fun detailOf(): ConnectionDetail =
        ConnectionDetail(
            id = "conn-1",
            registryName = "acme/mcp",
            displayName = null,
            enabled = true,
            permission = MarketplacePermission.READS,
            status = MarketplaceStatus.ACTIVE,
            authMode = MarketplaceAuthMode.OAUTH,
            lastError = null,
            scopes = emptyList(),
            tools = emptyList(),
        )
}
