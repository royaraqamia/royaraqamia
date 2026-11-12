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
 * The store tab's three routes (#1256).
 *
 * The app must read what the page reads: the same list of connections, the same
 * one bounded catalogue query (ADR-0162: no cursor), and the same start route.
 * The cache is part of the contract too — it is what makes a reopen instant, and
 * it must not survive a change of member.
 */
class McpStoreRepositoryTest {
    private val connectionsBody =
        """
        {
          "success": true,
          "data": [
            {
              "id": "conn-1", "registryName": "acme/mcp", "displayName": null,
              "enabled": true, "permissionLevel": "reads", "status": "active",
              "authMode": "oauth", "toolCount": 3,
              "connectedAt": "2026-11-01T09:00:00.000Z", "lastUsedAt": null,
              "lastError": null
            }
          ]
        }
        """.trimIndent()

    private val catalogueBody =
        """
        {
          "success": true,
          "data": {
            "servers": [
              {
                "registryName": "acme/mcp", "title": "Acme", "description": "An app",
                "nameAr": null, "iconUrl": null, "verified": true, "featuredRank": null,
                "connectable": true, "connectableReason": null, "authMode": "oauth",
                "probeAuthMode": null, "publishedAt": null, "requestedScopes": []
              }
            ],
            "nextCursor": null
          }
        }
        """.trimIndent()

    private fun repository(
        transport: RecordingTransport,
        identity: String = "user-1",
    ): McpStoreRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return McpStoreRepository(
            client = ApiClient("https://app.test", session, transport),
            siteUrl = "https://app.test",
            identityKey = { identity },
        )
    }

    @Test
    fun `the list asks the page's own route and maps the row`() {
        val transport = RecordingTransport { HttpResponse(200, connectionsBody) }

        val result = runBlocking { repository(transport).loadConnections() }

        val rows = (result as ApiResult.Success).value
        assertEquals("conn-1", rows.single().id)
        assertEquals(MarketplacePermission.READS, rows.single().permission)
        assertEquals(MarketplaceStatus.ACTIVE, rows.single().status)
        assertEquals("acme/mcp", rows.single().name)
        assertEquals("https://app.test/api/me/mcp/connections", transport.requests.single().url)
    }

    @Test
    fun `a refused list is a failure, not an empty store`() {
        val result =
            runBlocking {
                repository(RecordingTransport { HttpResponse(200, """{"success":false,"error":"nope"}""") })
                    .loadConnections()
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "nope")), result)
    }

    @Test
    fun `the blank search is the bounded store query`() {
        val transport = RecordingTransport { HttpResponse(200, catalogueBody) }

        val result = runBlocking { repository(transport).search("") }

        assertEquals(1, (result as ApiResult.Success).value.size)
        assertEquals("https://app.test/api/mcp/marketplace/servers", transport.requests.single().url)
    }

    @Test
    fun `a term travels as the route's own q`() {
        val transport = RecordingTransport { HttpResponse(200, catalogueBody) }

        runBlocking { repository(transport).search("أكمي") }

        assertTrue(transport.requests.single().url.endsWith("?q=%D8%A3%D9%83%D9%85%D9%8A"))
    }

    @Test
    fun `the session cache answers the next visit and follows the member`() {
        val transport = RecordingTransport { HttpResponse(200, catalogueBody) }
        var identity = "user-1"
        val repository =
            McpStoreRepository(
                client =
                    ApiClient(
                        "https://app.test",
                        runBlocking {
                            Session(
                                    MemoryTokenStore("refresh-1"),
                                    TokenRefresher { RefreshOutcome.Refused },
                                    MemoryIdentityStorage(),
                                )
                                .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
                        },
                        transport,
                    ),
                siteUrl = "https://app.test",
                identityKey = { identity },
            )

        runBlocking { repository.search("") }
        assertEquals(1, repository.cachedCatalogue()?.size)

        identity = "user-2"
        assertEquals(null, repository.cachedCatalogue())
    }

    @Test
    fun `a start answers the consent page it was given`() {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """{"success":true,"data":{"kind":"authorize","authorizeUrl":"https://provider.test/c"}}""",
                )
            }

        val result = runBlocking { repository(transport).start("acme/mcp") }

        assertEquals(MarketplaceStart.Authorize("https://provider.test/c"), (result as ApiResult.Success).value)
        assertEquals("POST", transport.requests.single().method)
        assertEquals(
            "https://app.test/api/mcp/marketplace/connections/start",
            transport.requests.single().url,
        )
    }

    @Test
    fun `a start without consent answers the connection it made`() {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """{"success":true,"data":{"kind":"connected","connectionId":"conn-9"}}""",
                )
            }

        val result = runBlocking { repository(transport).start("acme/mcp", "sk-1") }

        assertEquals(MarketplaceStart.Connected("conn-9"), (result as ApiResult.Success).value)
        assertTrue(transport.requests.single().body.orEmpty().contains("\"apiKey\":\"sk-1\""))
    }

    @Test
    fun `a refused start keeps the server's sentence`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport {
                            HttpResponse(200, """{"success":false,"error":"وصلت إلى حدّ التطبيقات"}""")
                        }
                    )
                    .start("acme/mcp")
            }

        assertEquals(
            ApiResult.Failure(ApiError.Server(200, "وصلت إلى حدّ التطبيقات")),
            result,
        )
    }

    @Test
    fun `the brand mark is read through our own proxy`() {
        val repository = repository(RecordingTransport { HttpResponse(200, "{}") })
        val server =
            MarketplaceServer(
                registryName = "acme/mcp",
                title = "Acme",
                description = null,
                nameAr = null,
                iconUrl = null,
                verified = true,
                authMode = MarketplaceAuthMode.OAUTH,
                requestedScopes = emptyList(),
            )

        assertEquals(
            "https://app.test/mcp/icon?name=acme%2Fmcp",
            repository.brandMarkUrl(server),
        )
    }
}
