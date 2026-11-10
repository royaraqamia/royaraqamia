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
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The allowance card's controls (#947): the two links lead where the page's lead,
 * the upgrade is drawn only for a free member, and a failed read offers a retry
 * instead of an empty card.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AccountUsageCardTest {
    @get:Rule val compose = createComposeRule()

    private fun draw(
        state: AccountUsageUiState,
        onOpenRoute: (String) -> Unit = {},
        onRetry: () -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AccountUsageCard(
                            state = state,
                            onOpenRoute = onOpenRoute,
                            onRetry = onRetry,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `the details link opens the plan page`() {
        var opened: String? = null
        draw(AccountUsageUiState.Ready(plan = "free", unlimited = false), onOpenRoute = { opened = it })

        compose.onNodeWithTag(AccountUsageTags.DETAILS).performClick()

        assertEquals("/account/plan", opened)
    }

    @Test
    fun `a free plan offers the upgrade, and it opens the pricing page`() {
        var opened: String? = null
        draw(AccountUsageUiState.Ready(plan = "free", unlimited = false), onOpenRoute = { opened = it })

        compose.onNodeWithTag(AccountUsageTags.UPGRADE).performClick()

        assertEquals("/pricing", opened)
    }

    @Test
    fun `a paid plan drops the upgrade nudge`() {
        draw(AccountUsageUiState.Ready(plan = "pro", unlimited = false))

        compose.onNodeWithTag(AccountUsageTags.DETAILS).assertExists()
        compose.onNodeWithTag(AccountUsageTags.UPGRADE).assertDoesNotExist()
    }

    @Test
    fun `an unlimited plan drops the upgrade nudge too`() {
        draw(AccountUsageUiState.Ready(plan = "free", unlimited = true))

        compose.onNodeWithTag(AccountUsageTags.UPGRADE).assertDoesNotExist()
    }

    @Test
    fun `a failed read offers a retry rather than an empty card`() {
        var retried = false
        draw(AccountUsageUiState.Failed, onRetry = { retried = true })

        compose.onNodeWithTag(AccountUsageTags.CARD).assertExists()
        compose.onNodeWithTag(AccountUsageTags.DETAILS).assertDoesNotExist()
        compose.onNodeWithTag(AccountUsageTags.RETRY).performClick()

        assertTrue("the retry was pressed", retried)
    }

    @Test
    fun `a visitor gets no card at all`() {
        draw(AccountUsageUiState.Hidden)

        compose.onNodeWithTag(AccountUsageTags.CARD).assertDoesNotExist()
    }

    @Test
    fun `a plan that cannot be read names no plan`() {
        var opened: String? = null
        draw(AccountUsageUiState.Failed, onOpenRoute = { opened = it })

        assertNull("a failed read cannot open a plan", opened)
    }
}
