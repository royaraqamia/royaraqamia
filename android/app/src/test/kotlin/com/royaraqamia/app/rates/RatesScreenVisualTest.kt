package com.royaraqamia.app.rates

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.contracts.generated.RatesBoardCurrenciesItem
import com.royaraqamia.app.contracts.generated.RatesBoardMetalsItem
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/rates` (#897, ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/rates/at-rest/app.json` and the converter card's own pixels to
 * `app.png`, and `check:visual` compares them with the page's recording. A number
 * that differs is a failure that names the element and both values.
 *
 * The board is the page's own structure at rest: the dollar against the Saudi riyal
 * (which the gate's Riyadh timezone resolves on the page), no parallel-basis row,
 * and gold and silver at the metals card. It is a fixture rather than the live board
 * because the contract measures the design, not the day's numbers.
 *
 * The boxes are measured; the type sizes and the paddings the contract names are
 * read from [RatesMetrics], the object the screen draws with, because Compose does
 * not expose resolved typography through the semantics tree. The raster is what
 * proves the type actually landed as declared.
 *
 * The screen is composed inside a 393dp-wide box because the window is 1080 px at
 * DPR 2.75, which is 392.7dp: the page is 393 CSS px and the boxes have to be
 * measured in the same units.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class RatesScreenVisualTest {
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
                    ),
                    RatesBoardCurrenciesItem(
                        code = "SAR",
                        name = "الريال السعودي",
                        symbol = "ر.س",
                        rate = 3.75,
                        previousRate = 3.75,
                        changePct = 0.0,
                        asOf = "2026-11-05",
                        parallel = null,
                    ),
                ),
            metals =
                listOf(
                    RatesBoardMetalsItem(
                        code = "XAU",
                        name = "الذَّهب",
                        pricePerOunceUsd = 2000.0,
                        pricePerGramUsd = RatesMath.pricePerGram(2000.0),
                        previousPricePerOunceUsd = 1980.0,
                        changePct = 1.0,
                        karats = emptyList(),
                    ),
                    RatesBoardMetalsItem(
                        code = "XAG",
                        name = "الفِضَّة",
                        pricePerOunceUsd = 25.0,
                        pricePerGramUsd = RatesMath.pricePerGram(25.0),
                        previousPricePerOunceUsd = 25.0,
                        changePct = 0.0,
                        karats = emptyList(),
                    ),
                ),
        )

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        RatesScreen(board = board)
                    }
                }
            }
        }

        fun top(tag: String) =
            compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value

        fun width(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.right - box.left).value
        }

        fun height(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.bottom - box.top).value
        }

        val json =
            """
            {
              "surface": "rates",
              "elements": {
                "title": {
                  "top": ${top(RatesMetrics.TITLE)},
                  "height": ${height(RatesMetrics.TITLE)},
                  "fontSize": ${RatesMetrics.titleSize.value},
                  "fontWeight": ${RatesMetrics.titleWeight.weight}
                },
                "board": {
                  "top": ${top(RatesMetrics.BOARD)},
                  "height": ${height(RatesMetrics.BOARD)},
                  "fontSize": ${RatesMetrics.boardTextSize.value}
                },
                "converter": {
                  "top": ${top(RatesMetrics.CONVERTER)},
                  "width": ${width(RatesMetrics.CONVERTER)},
                  "height": ${height(RatesMetrics.CONVERTER)},
                  "radius": ${RatesMetrics.cardRadius.value},
                  "paddingTop": ${RatesMetrics.cardPadding.value},
                  "paddingLeft": ${RatesMetrics.cardPadding.value}
                },
                "amount": {
                  "width": ${width(RatesMetrics.AMOUNT)},
                  "height": ${height(RatesMetrics.AMOUNT)},
                  "radius": ${RatesMetrics.fieldRadius.value},
                  "fontSize": ${RatesMetrics.fieldTextSize.value},
                  "paddingLeft": ${RatesMetrics.fieldPadding.value},
                  "paddingRight": ${RatesMetrics.fieldPadding.value}
                },
                "from": {
                  "width": ${width(RatesMetrics.FROM)},
                  "height": ${height(RatesMetrics.FROM)},
                  "radius": ${RatesMetrics.fieldRadius.value},
                  "fontSize": ${RatesMetrics.fieldTextSize.value}
                },
                "to": {
                  "width": ${width(RatesMetrics.TO)},
                  "height": ${height(RatesMetrics.TO)},
                  "radius": ${RatesMetrics.fieldRadius.value},
                  "fontSize": ${RatesMetrics.fieldTextSize.value}
                },
                "result": {
                  "top": ${top(RatesMetrics.RESULT)},
                  "width": ${width(RatesMetrics.RESULT)},
                  "height": ${height(RatesMetrics.RESULT)},
                  "radius": ${RatesMetrics.resultRadius.value},
                  "paddingTop": ${RatesMetrics.resultPadding.value},
                  "paddingLeft": ${RatesMetrics.resultPadding.value}
                },
                "metals-title": {
                  "top": ${top(RatesMetrics.METALS_TITLE)},
                  "height": ${height(RatesMetrics.METALS_TITLE)},
                  "fontSize": ${RatesMetrics.metalsTitleSize.value},
                  "fontWeight": 700
                },
                "metals-card": {
                  "top": ${top(RatesMetrics.METALS_CARD)},
                  "width": ${width(RatesMetrics.METALS_CARD)},
                  "height": ${height(RatesMetrics.METALS_CARD)},
                  "radius": ${RatesMetrics.cardRadius.value},
                  "paddingTop": ${RatesMetrics.cardPadding.value},
                  "paddingLeft": ${RatesMetrics.cardPadding.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/rates/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(RatesMetrics.CONVERTER, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
