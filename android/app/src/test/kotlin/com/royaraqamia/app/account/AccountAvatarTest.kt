package com.royaraqamia.app.account

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The avatar's two faces (#945): the picture when the read answers, the initial
 * letter when it does not.
 *
 * A failed read is the case that matters — the card must still say whose it is
 * rather than leaving a hole — so the loader here is a fake that answers `null`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AccountAvatarTest {
    @get:Rule val compose = createComposeRule()

    private fun draw(name: String?, avatarUrl: String?, loader: AvatarLoader) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AccountAvatar(name = name, avatarUrl = avatarUrl, loader = loader)
                    }
                }
            }
        }
    }

    @Test
    fun `a failed read draws the initial letter rather than a hole`() {
        draw(name = "أحمد", avatarUrl = "https://cdn.test/a.png", loader = AvatarLoader { null })

        compose.onNodeWithText("أ").assertExists()
    }

    @Test
    fun `a blank URL draws the initial without a read`() {
        var reads = 0
        draw(
            name = "أحمد",
            avatarUrl = null,
            loader = AvatarLoader {
                reads += 1
                null
            },
        )

        compose.onNodeWithText("أ").assertExists()
        assertEquals(0, reads)
    }

    @Test
    fun `a read that answers draws the picture`() {
        draw(
            name = "أحمد",
            avatarUrl = "https://cdn.test/a.png",
            loader = AvatarLoader { onePixelPng() },
        )

        compose.waitUntil(5_000) {
            compose.onAllNodesWithContentDescription("أحمد").fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithContentDescription("أحمد").assertExists()
    }

    private fun onePixelPng(): ByteArray =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
            )
}
