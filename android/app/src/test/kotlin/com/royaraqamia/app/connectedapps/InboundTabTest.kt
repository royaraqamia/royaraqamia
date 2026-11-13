package com.royaraqamia.app.connectedapps

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The connected list as the sheet's third tab (#1256).
 *
 * The card is the account screen's and is proven there; what this tab adds is the
 * host's read — the same route, the same cache, and the surface's search term
 * reaching the card rather than a second list.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-xxhdpi")
class InboundTabTest {
    @get:Rule val compose = createComposeRule()

    private val listBody =
        """
        {
          "success": true,
          "data": [
            { "clientId": "client-1", "clientName": "Claude Code",
              "connectedAt": "2026-11-01T09:00:00.000Z", "lastUsedAt": null }
          ]
        }
        """.trimIndent()

    private fun repository(body: String = listBody): ConnectedAppsRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return ConnectedAppsRepository(
            client = ApiClient("https://app.test", session, RecordingTransport { HttpResponse(200, body) }),
            identityKey = { "user-1" },
        )
    }

    private fun tab(
        repository: ConnectedAppsRepository = repository(),
        query: String = "",
        signedIn: Boolean = true,
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    InboundTab(
                        repository = repository,
                        signedIn = signedIn,
                        query = query,
                        onSignIn = {},
                        onConnectNew = {},
                    )
                }
            }
        }
    }

    @Test
    fun `the tab draws the clients the server lists`() {
        tab()

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithText("Claude Code").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithText("Claude Code").assertIsDisplayed()
    }

    @Test
    fun `a search that matches nothing says so`() {
        tab(query = "zzz")

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithText(ConnectedAppsCopy.SEARCH_EMPTY_INBOUND)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        compose.onNodeWithText(ConnectedAppsCopy.SEARCH_EMPTY_INBOUND).assertIsDisplayed()
    }

    @Test
    fun `no session is the card's guest prompt`() {
        tab(signedIn = false)

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithText(ConnectedAppsCopy.SIGN_IN)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }
}
