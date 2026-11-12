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
 * The store panel of the apps sheet (#1256, ADR-0162).
 *
 * What the page's store tab promises, proven on the app's side of the pair: an
 * empty store and a search that matched nothing are two different sentences, a
 * verified row says so, and the connect pill asks before the document leaves for
 * the provider's own origin.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-xxhdpi")
class MarketplaceTabTest {
    @get:Rule val compose = createComposeRule()

    private fun session(): Session =
        runBlocking {
            Session(
                    MemoryTokenStore("refresh-1"),
                    TokenRefresher { RefreshOutcome.Refused },
                    MemoryIdentityStorage(),
                )
                .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    private fun repository(transport: RecordingTransport): McpStoreRepository =
        McpStoreRepository(
            client = ApiClient("https://app.test", session(), transport),
            siteUrl = "https://app.test",
            identityKey = { "user-1" },
        )

    private fun store(servers: String, query: String = "", onStart: (String) -> Unit = {}) {
        val transport =
            RecordingTransport { request ->
                when {
                    request.url.endsWith("/api/me/mcp/connections") ->
                        HttpResponse(200, """{"success":true,"data":[]}""")
                    request.url.endsWith("/connections/start") -> {
                        onStart(request.body.orEmpty())
                        HttpResponse(
                            200,
                            """{"success":true,"data":{"kind":"authorize","authorizeUrl":"https://provider.test/consent"}}""",
                        )
                    }
                    else -> HttpResponse(200, """{"success":true,"data":{"servers":$servers,"nextCursor":null}}""")
                }
            }
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    MarketplaceTab(
                        repository = repository(transport),
                        query = query,
                        signedIn = true,
                        onSignIn = {},
                        onOpenConnection = {},
                        onOpenExternal = {},
                    )
                }
            }
        }
    }

    @Test
    fun `an empty store is its own sentence`() {
        store(servers = "[]")

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(MarketplaceMetrics.EMPTY_TITLE).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText(McpStoreCopy.STORE_EMPTY_TITLE).assertIsDisplayed()
    }

    @Test
    fun `a term that matches nothing says so instead`() {
        store(servers = "[]", query = "zzz")

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(MarketplaceMetrics.EMPTY_TITLE).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText(McpStoreCopy.SEARCH_EMPTY_TITLE).assertIsDisplayed()
    }

    @Test
    fun `a verified row draws the badge and its own name`() {
        store(
            servers =
                """
                [{
                  "registryName": "acme/mcp", "title": "Acme", "description": "An app",
                  "nameAr": "أكمي", "iconUrl": null, "verified": true,
                  "featuredRank": null, "connectable": true, "connectableReason": null,
                  "authMode": "oauth", "probeAuthMode": "oauth",
                  "publishedAt": "2026-11-01T00:00:00.000Z", "requestedScopes": []
                }]
                """
                    .trimIndent()
        )

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(MarketplaceMetrics.SERVER).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Acme").assertIsDisplayed()
        compose.onNodeWithText(McpStoreCopy.VERIFIED_BADGE).assertIsDisplayed()
        compose.onNodeWithTag(MarketplaceMetrics.MARK).assertIsDisplayed()
    }

    @Test
    fun `the connect pill asks for consent before the provider is visited`() {
        var started: String? = null
        store(
            servers =
                """
                [{
                  "registryName": "acme/mcp", "title": "Acme", "description": null,
                  "nameAr": null, "iconUrl": null, "verified": true,
                  "featuredRank": null, "connectable": true, "connectableReason": null,
                  "authMode": "oauth", "probeAuthMode": "oauth",
                  "publishedAt": "2026-11-01T00:00:00.000Z",
                  "requestedScopes": ["read"]
                }]
                """
                    .trimIndent(),
            onStart = { started = it },
        )

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(MarketplaceMetrics.CONNECT).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(MarketplaceMetrics.CONNECT).performClick()

        // The ask is the row's own scopes, read before anything leaves.
        compose.onNodeWithTag(MarketplaceMetrics.CONSENT).assertIsDisplayed()
        compose.onNodeWithText(McpStoreCopy.CONSENT_ASK).assertIsDisplayed()

        compose.onNodeWithTag(MarketplaceMetrics.CONSENT_CONFIRM).performClick()
        compose.waitUntil(timeoutMillis = 5_000) { started != null }
        assertTrue(started!!.contains("\"registryName\":\"acme/mcp\""))
    }

    @Test
    fun `connecting is one write, and the panel leaves for the provider`() {
        var opened: String? = null
        var requests = 0
        val transport =
            RecordingTransport { request ->
                when {
                    request.url.endsWith("/api/me/mcp/connections") ->
                        HttpResponse(200, """{"success":true,"data":[]}""")
                    request.url.endsWith("/connections/start") -> {
                        requests += 1
                        HttpResponse(
                            200,
                            """{"success":true,"data":{"kind":"authorize","authorizeUrl":"https://provider.test/consent"}}""",
                        )
                    }
                    else ->
                        HttpResponse(
                            200,
                            """{"success":true,"data":{"servers":[{"registryName":"acme/mcp","title":"Acme","description":null,"nameAr":null,"iconUrl":null,"verified":true,"featuredRank":null,"connectable":true,"connectableReason":null,"authMode":"none","probeAuthMode":"none","publishedAt":null,"requestedScopes":[]}],"nextCursor":null}}""",
                        )
                }
            }
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    MarketplaceTab(
                        repository = repository(transport),
                        query = "",
                        signedIn = true,
                        onSignIn = {},
                        onOpenConnection = {},
                        onOpenExternal = { opened = it },
                    )
                }
            }
        }

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag(MarketplaceMetrics.CONNECT).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(MarketplaceMetrics.CONNECT).performClick()
        compose.onNodeWithTag(MarketplaceMetrics.CONSENT_CONFIRM).performClick()

        compose.waitUntil(timeoutMillis = 5_000) { opened != null }
        assertEquals("https://provider.test/consent", opened)
        assertEquals(1, requests)
    }
}
