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
import com.royaraqamia.app.theme.RoyaraqamiaTheme
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
 * write and stays inert while that write is in flight.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-xxhdpi")
class AppsSheetTest {
    @get:Rule val compose = createComposeRule()

    private fun sheet(
        busy: String? = null,
        onToggle: (String) -> Unit = {},
        onOpenMarketplace: () -> Unit = {},
        onOpenConnectedApps: () -> Unit = {},
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
                        onOpenMarketplace = onOpenMarketplace,
                        onOpenConnectedApps = onOpenConnectedApps,
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
        compose.onNodeWithTag("apps-search").performTextInput("القرآن")

        val after = compose.onAllNodesWithTag("services-row").fetchSemanticsNodes().size
        assertTrue("the filter should leave fewer rows than the nine", after < before)
        compose.onNodeWithTag("services-row").assertIsDisplayed()
    }

    @Test
    fun `a search that matches nothing says so`() {
        sheet()

        compose.onNodeWithTag("apps-search").performTextInput("999")
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
    fun `the two MCP tabs are doors`() {
        var store = false
        var connected = false
        sheet(onOpenMarketplace = { store = true }, onOpenConnectedApps = { connected = true })

        compose.onNodeWithText(AppsSheetCopy.TAB_EXTERNAL).performClick()
        assertTrue(store)
        compose.onNodeWithText(AppsSheetCopy.TAB_INBOUND).performClick()
        assertTrue(connected)
    }
}
