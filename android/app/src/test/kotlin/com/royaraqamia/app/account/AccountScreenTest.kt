package com.royaraqamia.app.account

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.LayoutDirection
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
 * The account screen's controls (#948): a row opens its route, the sign-out asks
 * before it acts, and a guest is given no sign-out to press.
 *
 * The routes are the shell's own — `AccountRows` never learns a URL beyond the
 * site's route grammar — so a destination with no native screen is handed to the
 * document by `ShellActivity.openRoute`, which is what this callback stands for.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AccountScreenTest {
    @get:Rule val compose = createComposeRule()

    private fun draw(
        state: AccountUiState = AccountUiState.Member,
        isAdmin: Boolean = false,
        onOpenRoute: (String) -> Unit = {},
        onSignOut: () -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AccountScreen(
                            state = state,
                            isAdmin = isAdmin,
                            onOpenRoute = onOpenRoute,
                            onSignOut = onSignOut,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `a row opens the route the page gives it`() {
        var opened: String? = null
        draw(onOpenRoute = { opened = it })

        compose.onNodeWithTag(AccountTags.row("submissions")).performScrollTo().performClick()

        assertEquals("/account/submissions", opened)
    }

    @Test
    fun `support is the site's chat account, not WhatsApp`() {
        var opened: String? = null
        draw(onOpenRoute = { opened = it })

        compose.onNodeWithTag(AccountTags.row("contact")).performScrollTo().performClick()

        assertEquals("/chats/new?to=royaraqamia", opened)
    }

    @Test
    fun `signing out asks first and then hands the screen the action`() {
        var signedOut = false
        draw(onSignOut = { signedOut = true })

        compose.onNodeWithTag(AccountTags.SIGN_OUT).performScrollTo().performClick()
        compose.onNodeWithTag(AccountTags.SIGN_OUT_CONFIRM).performClick()

        assertTrue("the question was answered", signedOut)
    }

    @Test
    fun `a guest gets the rows but no sign-out and no admin row`() {
        draw(state = AccountUiState.Guest)

        compose.onNodeWithTag(AccountTags.row("faq")).assertExists()
        compose.onNodeWithTag(AccountTags.row("admin")).assertDoesNotExist()
        compose.onNodeWithTag(AccountTags.SIGN_OUT).assertDoesNotExist()
    }
}
