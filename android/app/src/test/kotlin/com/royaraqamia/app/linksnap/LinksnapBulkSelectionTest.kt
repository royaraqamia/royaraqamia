package com.royaraqamia.app.linksnap

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The bulk bar's selection (#942).
 *
 * Two claims: the set operations the bar exposes (toggle, toggle-all, clear,
 * dropping what a pull no longer shows), and that the selection survives a saved
 * instance restore rather than resetting when the activity is recreated.
 */
@RunWith(RobolectricTestRunner::class)
class LinksnapBulkSelectionTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `select all selects every visible row and clears on the second press`() {
        val selection = LinksnapBulkSelection()
        val visible = listOf("a", "b")

        selection.toggleAll(visible)
        assertEquals(setOf("a", "b"), selection.codes)
        assertTrue(selection.allSelected(visible))

        selection.toggleAll(visible)
        assertTrue(selection.codes.isEmpty())
        assertFalse(selection.allSelected(visible))
    }

    @Test
    fun `a single row toggles without disturbing the others`() {
        val selection = LinksnapBulkSelection(setOf("a"))

        selection.toggle("b")
        assertEquals(setOf("a", "b"), selection.codes)

        selection.toggle("a")
        assertEquals(setOf("b"), selection.codes)
    }

    @Test
    fun `clearing after a write leaves no count behind`() {
        val selection = LinksnapBulkSelection(setOf("a", "b"))

        selection.clear()

        assertEquals(0, selection.count)
        assertFalse(selection.allSelected(listOf("a", "b")))
    }

    @Test
    fun `a code the list no longer shows is dropped`() {
        val selection = LinksnapBulkSelection(setOf("a", "b"))

        selection.retain(listOf("b"))

        assertEquals(setOf("b"), selection.codes)
    }

    @Test
    fun `the selection survives a saved instance restore`() {
        val restoration = StateRestorationTester(compose)
        lateinit var selection: LinksnapBulkSelection

        restoration.setContent {
            selection =
                rememberSaveable(saver = LinksnapBulkSelection.Saver) { LinksnapBulkSelection() }
            Column {
                Text(
                    text = "toggle",
                    modifier =
                        Modifier.testTag("toggle").clickable {
                            selection.toggle("e2e-visual-gate")
                        },
                )
                Text(text = "count ${selection.count}", modifier = Modifier.testTag("count"))
            }
        }

        compose.onNodeWithTag("toggle").performClick()
        compose.onNodeWithTag("count").assertTextEquals("count 1")

        restoration.emulateSavedInstanceStateRestore()

        compose.onNodeWithTag("count").assertTextEquals("count 1")
    }
}
