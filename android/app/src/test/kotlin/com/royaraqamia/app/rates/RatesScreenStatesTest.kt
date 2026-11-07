package com.royaraqamia.app.rates

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.contracts.generated.RatesBoardCurrenciesItem
import com.royaraqamia.app.shared.NeedsConnectionCopy
import com.royaraqamia.app.shared.ReadFailureCopy
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The rates screen's offline faces (#928).
 *
 * The shared public-surface rule says a stale snapshot names itself and a screen
 * with nothing to show names the connection; ADR-0031 adds that a refusal is not
 * an offline state. These are the three statements this test holds, so a later
 * change cannot fold them into one block.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class RatesScreenStatesTest {
    @get:Rule val compose = createComposeRule()

    private val board =
        RatesBoard(
            base = "USD",
            fetchedAt = "2026-11-05T06:26:43.000Z",
            providerQuoteDate = "2026-11-05",
            isStale = false,
            currencies =
                listOf(
                    RatesBoardCurrenciesItem(
                        code = "USD",
                        name = "الدولار الأمريكي",
                        symbol = "$",
                        rate = 1.0,
                        previousRate = 1.0,
                        changePct = 0.0,
                        asOf = "2026-11-05",
                        parallel = null,
                    )
                ),
            metals = emptyList(),
        )

    @Test
    fun `a stale snapshot says it is stale`() {
        compose.setContent {
            RoyaraqamiaTheme {
                RatesScreen(state = RatesUiState.Snapshot(board), onRetry = {})
            }
        }

        compose.onNodeWithText(RatesPageCopy.STALE_BADGE).assertExists()
    }

    @Test
    fun `an unreachable server names the connection`() {
        compose.setContent {
            RoyaraqamiaTheme {
                RatesScreen(state = RatesUiState.Unavailable(offline = true), onRetry = {})
            }
        }

        compose.onNodeWithText(NeedsConnectionCopy.TITLE).assertExists()
        compose.onNodeWithText(ReadFailureCopy.TITLE).assertDoesNotExist()
    }

    @Test
    fun `a refusal names the read failure, not the connection`() {
        compose.setContent {
            RoyaraqamiaTheme {
                RatesScreen(state = RatesUiState.Unavailable(offline = false), onRetry = {})
            }
        }

        compose.onNodeWithText(ReadFailureCopy.TITLE).assertExists()
        compose.onNodeWithText(NeedsConnectionCopy.TITLE).assertDoesNotExist()
    }
}
