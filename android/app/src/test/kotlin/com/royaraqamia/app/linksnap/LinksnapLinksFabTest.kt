package com.royaraqamia.app.linksnap

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.auth.SignInCopy
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The shortener's account door (#1208): two faces, the two the page draws.
 *
 * A member's press leaves for their owned links; a guest's press opens the prompt
 * the page shows instead of a redirect, and the prompt is what asks for the
 * sign-in. The screen passes those callbacks in, so the door itself is the only
 * thing under test here.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class LinksnapLinksFabTest {
    @get:Rule val compose = createComposeRule()

    private fun draw(
        signedIn: Boolean,
        onOpenLinks: () -> Unit = {},
        onSignIn: () -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapLinksFab(
                            signedIn = signedIn,
                            onOpenLinks = onOpenLinks,
                            onSignIn = onSignIn,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `a member's press opens the owned links`() {
        var opened = 0
        draw(signedIn = true, onOpenLinks = { opened += 1 })

        compose.onNodeWithTag(LinksnapMetrics.FAB).performClick()

        assertEquals(1, opened)
        compose.onNodeWithText(LinksnapLinksFabCopy.GUEST_TITLE).assertDoesNotExist()
    }

    @Test
    fun `a guest's press asks for the sign-in the prompt offers`() {
        var signIns = 0
        draw(signedIn = false, onSignIn = { signIns += 1 })

        compose.onNodeWithTag(LinksnapMetrics.FAB).performClick()
        compose.onNodeWithText(LinksnapLinksFabCopy.GUEST_TITLE).assertExists()
        compose.onNodeWithText(SignInCopy.SUBMIT).performClick()

        assertEquals(1, signIns)
    }
}
