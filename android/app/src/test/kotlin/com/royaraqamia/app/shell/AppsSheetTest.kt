package com.royaraqamia.app.shell

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
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.mcp.McpStoreRepository
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
 * The apps sheet's three tabs, its one search field and its one write (#1256).
 *
 * The sheet is the site's apps surface, so what is worth a test is what the
 * surface promises: three tabs that are all visible, a field that filters the
 * picker rather than the network, and a row action that asks for exactly one
 * write and stays inert while that write is in flight. The store tab is a panel
 * since #1256, so the field follows the tab and the panel is drawn in the body;
 * the connected list is still the door that screen already is.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-xxhdpi")
class AppsSheetTest {
    @get:Rule val compose = createComposeRule()

    private fun store(): McpStoreRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        val transport =
            RecordingTransport { request ->
                when {
                    request.url.endsWith("/api/me/mcp/connections") ->
                        HttpResponse(200, """{"success":true,"data":[]}""")
                    else ->
                        HttpResponse(200, """{"success":true,"data":{"servers":[],"nextCursor":null}}""")
                }
            }
        return McpStoreRepository(
            client = ApiClient("https://app.test", session, transport),
            siteUrl = "https://app.test",
            identityKey = { "user-1" },
        )
    }

    /** The connected list's read: an empty list, so the tab draws its empty card. */
    private fun connectedApps(): ConnectedAppsRepository {
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
            client =
                ApiClient(
                    "https://app.test",
                    session,
                    RecordingTransport { HttpResponse(200, """{"success":true,"data":[]}""") },
                ),
            identityKey = { "user-1" },
        )
    }

    private fun sheet(
        busy: String? = null,
        onToggle: (String) -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.width(393.dp).height(852.dp)) {
                    ServicesSheet(
                        open = true,
                        order = listOf("/quran"),
                        busy = busy,
                        error = null,
                        onToggle = onToggle,
                        onDismiss = {},
                        marketplace = store(),
                        connectedApps = connectedApps(),
                        signedIn = true,
                    )
                }
            }
        }
    }

    @Test
    fun `the sheet draws the surface's three tabs`() {
        sheet()

        compose.onNodeWithText(AppsSheetCopy.TAB_INTERNAL).assertIsDisplayed()
        compose.onNodeWithText(AppsSheetCopy.TAB_EXTERNAL).assertIsDisplayed()
        compose.onNodeWithText(AppsSheetCopy.TAB_INBOUND).assertIsDisplayed()
        assertEquals(3, compose.onAllNodesWithTag("apps-tab").fetchSemanticsNodes().size)
    }

    @Test
    fun `the search filters the picker locally`() {
        sheet()

        val before = compose.onAllNodesWithTag("services-row").fetchSemanticsNodes().size
        compose.onNodeWithTag("apps-search-input").performTextInput("القرآن")

        val after = compose.onAllNodesWithTag("services-row").fetchSemanticsNodes().size
        assertTrue("the filter should leave fewer rows than the nine", after < before)
        compose.onNodeWithTag("services-row").assertIsDisplayed()
    }

    @Test
    fun `a search that matches nothing says so`() {
        sheet()

        compose.onNodeWithTag("apps-search-input").performTextInput("999")
        compose.onNodeWithText(ServicesSheetCopy.SEARCH_EMPTY_INTERNAL).assertIsDisplayed()
    }

    @Test
    fun `a row action asks for one write`() {
        var toggled: String? = null
        sheet(onToggle = { toggled = it })

        compose.onAllNodesWithTag("services-row-action")[0].performClick()
        assertEquals(ServicesEntry.rows.first().route, toggled)
    }

    @Test
    fun `a write in flight leaves every row inert`() {
        var toggled: String? = null
        sheet(busy = ServicesEntry.rows.first().route, onToggle = { toggled = it })

        compose.onAllNodesWithTag("services-row-action")[1].performClick()
        assertEquals(null, toggled)
    }

    @Test
    fun `the store tab draws the panel in the sheet`() {
        sheet()

        compose.onNodeWithText(AppsSheetCopy.TAB_EXTERNAL).performClick()

        compose.onNodeWithTag("marketplace-panel").assertIsDisplayed()
        // The picker's rows are gone: one surface, one body (#1256).
        assertEquals(0, compose.onAllNodesWithTag("services-row").fetchSemanticsNodes().size)
    }

    @Test
    fun `the connected tab draws the list in the sheet`() {
        sheet()

        compose.onNodeWithText(AppsSheetCopy.TAB_INBOUND).performClick()

        compose.onNodeWithTag("inbound-panel").assertIsDisplayed()
        assertEquals(0, compose.onAllNodesWithTag("services-row").fetchSemanticsNodes().size)
    }
}
