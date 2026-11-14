package com.royaraqamia.app.mcp

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The post-connect screen (#1256).
 *
 * What the page's connection view promises, proven on the app's side: the grant
 * and the tools are drawn, a tool's switch is one write, a refused read that
 * names "not on this account" is its own sentence rather than a retry, and a
 * disconnect is confirmed before it is sent.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-xxhdpi")
class ConnectionScreenTest {
    @get:Rule val compose = createComposeRule()

    private val detailBody =
        """
        {
          "success": true,
          "data": {
            "id": "conn-1", "registryName": "acme/mcp", "displayName": null,
            "enabled": true, "permissionLevel": "reads", "status": "active",
            "authMode": "api_key", "toolCount": 1,
            "connectedAt": "2026-11-01T09:00:00.000Z", "lastUsedAt": null,
            "lastError": null, "scopes": [],
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

    private fun client(transport: RecordingTransport) =
        ApiClient("https://app.test", session(), transport)

    private fun screen(
        body: String = detailBody,
        signedIn: Boolean = true,
        onDisconnected: () -> Unit = {},
        requests: MutableList<String> = CopyOnWriteArrayList(),
    ) {
        val transport =
            RecordingTransport { request ->
                requests += "${request.method} ${request.url}"
                when {
                    request.url.endsWith("/tools") -> HttpResponse(200, """{"success":true}""")
                    request.method == "DELETE" -> HttpResponse(200, """{"success":true}""")
                    else -> HttpResponse(200, body)
                }
            }
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    ConnectionScreen(
                        repository = McpConnectionRepository(client(transport)),
                        store =
                            McpStoreRepository(
                                client = client(transport),
                                siteUrl = "https://app.test",
                                identityKey = { "user-1" },
                            ),
                        connectionId = "conn-1",
                        signedIn = signedIn,
                        connected = false,
                        onSignIn = {},
                        onOpenExternal = {},
                        onDisconnected = onDisconnected,
                    )
                }
            }
        }
    }

    @Test
    fun `the screen draws the grant and the tools`() {
        screen()

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(ConnectionMetrics.TITLE).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("acme/mcp").assertIsDisplayed()
        compose.onNodeWithTag(ConnectionMetrics.TOOL).assertIsDisplayed()
        compose.onNodeWithText("search").assertIsDisplayed()
    }

    @Test
    fun `a connection that is not the member's says so`() {
        val transport =
            RecordingTransport {
                HttpResponse(404, """{"success":false,"error":"gone"}""")
            }
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    ConnectionScreen(
                        repository = McpConnectionRepository(client(transport)),
                        store =
                            McpStoreRepository(
                                client = client(transport),
                                siteUrl = "https://app.test",
                                identityKey = { "user-1" },
                            ),
                        connectionId = "conn-9",
                        signedIn = true,
                        connected = false,
                        onSignIn = {},
                        onOpenExternal = {},
                        onDisconnected = {},
                    )
                }
            }
        }

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(ConnectionMetrics.NOT_FOUND).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText(McpConnectionCopy.DETAIL_NOT_FOUND).assertIsDisplayed()
    }

    @Test
    fun `a tool's switch is one write`() {
        val requests = CopyOnWriteArrayList<String>()
        screen(requests = requests)

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(ConnectionMetrics.TOOL_SWITCH).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(ConnectionMetrics.TOOL_SWITCH).performClick()

        compose.waitUntil(timeoutMillis = 5_000) { requests.any { it.contains("/tools") } }
        assertEquals(1, requests.count { it.contains("/tools") })
    }

    @Test
    fun `a disconnect is confirmed before it is sent`() {
        var disconnected = false
        screen(onDisconnected = { disconnected = true })

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(ConnectionMetrics.DISCONNECT).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(ConnectionMetrics.DISCONNECT).performScrollTo().performClick()
        compose.onNodeWithTag(ConnectionMetrics.CONFIRM).assertIsDisplayed()
        assertEquals(false, disconnected)

        compose.onNodeWithTag(ConnectionMetrics.CONFIRM_ACTION).performClick()
        compose.waitUntil(timeoutMillis = 5_000) { disconnected }
        assertTrue(disconnected)
    }

    @Test
    fun `no session is the sign-in card, before any request`() {
        val requests = CopyOnWriteArrayList<String>()
        screen(signedIn = false, requests = requests)

        compose.onNodeWithTag(ConnectionMetrics.SIGNED_OUT).assertIsDisplayed()
        assertEquals(emptyList<String>(), requests)
    }
}
