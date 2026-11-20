package com.royaraqamia.app.home

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The door's composition (#1399, ADR-0146, ADR-0151).
 *
 * The three states the page draws: the first-run card with no apps, the strip
 * with the selected app under it, and the strip's own action opening the picker
 * rather than a second onboarding flow. The surface is a stub because the point
 * is where it is drawn, not which app it is — each app's own visual test is the
 * gate for its content.
 */
@RunWith(RobolectricTestRunner::class)
class HomeScreenTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `a member with no apps gets the first-run card`() {
        compose.setContent {
            RoyaraqamiaTheme {
                HomeScreen(
                    order = emptyList(),
                    status = HomeServicesStatus.Ready,
                    selected = null,
                    onSelect = {},
                    onAddApp = {},
                    onReorder = {},
                    surface = {},
                )
            }
        }

        compose.onNodeWithTag("home-empty").assertIsDisplayed()
    }

    @Test
    fun `the selected app is drawn under the strip`() {
        compose.setContent {
            RoyaraqamiaTheme {
                HomeScreen(
                    order = listOf("/quran", "/notes"),
                    status = HomeServicesStatus.Ready,
                    selected = "/notes",
                    onSelect = {},
                    onAddApp = {},
                    onReorder = {},
                    surface = { route ->
                        Box(Modifier.testTag("stub-surface")) { Text(route) }
                    },
                )
            }
        }

        compose.onNodeWithTag("home-app-strip").assertIsDisplayed()
        compose.onNodeWithTag("stub-surface").assertIsDisplayed()
        compose.onNodeWithText("/notes").assertIsDisplayed()
    }

    @Test
    fun `the first-run card opens the same picker`() {
        var opened = false
        compose.setContent {
            RoyaraqamiaTheme {
                HomeScreen(
                    order = emptyList(),
                    status = HomeServicesStatus.Ready,
                    selected = null,
                    onSelect = {},
                    onAddApp = { opened = true },
                    onReorder = {},
                    surface = {},
                )
            }
        }

        compose.onNodeWithTag("home-empty-add").performClick()

        assert(opened)
    }
}
