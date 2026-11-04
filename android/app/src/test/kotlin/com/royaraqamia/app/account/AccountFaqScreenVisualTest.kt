package com.royaraqamia.app.account

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
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/account/faq` (#949, ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/account-faq/app.json` and the open first card's own pixels to
 * `app.png`, and `check:visual` compares them with the page's recording. A number
 * that differs is a failure that names the element and both values.
 *
 * The screen is composed with the first question open, which is the page at rest:
 * the site leaves index 0 open.
 *
 * The boxes are measured; the type sizes, weights and the padding the contract
 * names are read from [AccountFaqMetrics], the object the screen draws with,
 * because Compose does not expose resolved typography through the semantics tree.
 * The raster is what proves the type actually landed as declared.
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
class AccountFaqScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AccountFaqScreen()
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
              "surface": "account-faq",
              "elements": {
                "title": {
                  "top": ${top(AccountFaqMetrics.TITLE)},
                  "height": ${height(AccountFaqMetrics.TITLE)},
                  "fontSize": ${AccountFaqMetrics.titleSize.value},
                  "fontWeight": ${AccountFaqMetrics.titleWeight.weight}
                },
                "list": {
                  "top": ${top(AccountFaqMetrics.LIST)},
                  "width": ${width(AccountFaqMetrics.LIST)},
                  "rowGap": ${AccountFaqMetrics.rowGap.value}
                },
                "first-row": {
                  "top": ${top(AccountFaqMetrics.rowTag(0))},
                  "width": ${width(AccountFaqMetrics.rowTag(0))},
                  "height": ${height(AccountFaqMetrics.rowTag(0))},
                  "radius": ${AccountFaqMetrics.cardRadius.value}
                },
                "first-question": {
                  "height": ${height(AccountFaqMetrics.questionTag(0))},
                  "paddingLeft": ${AccountFaqMetrics.rowPaddingHorizontal.value},
                  "paddingRight": ${AccountFaqMetrics.rowPaddingHorizontal.value}
                },
                "first-question-text": {
                  "height": ${height(AccountFaqMetrics.questionTextTag(0))},
                  "fontSize": ${AccountFaqMetrics.questionSize.value},
                  "fontWeight": ${AccountFaqMetrics.questionWeight.weight}
                },
                "first-answer": {
                  "top": ${top(AccountFaqMetrics.answerTag(0))},
                  "height": ${height(AccountFaqMetrics.answerTag(0))}
                },
                "second-row": {
                  "top": ${top(AccountFaqMetrics.rowTag(1))},
                  "width": ${width(AccountFaqMetrics.rowTag(1))},
                  "height": ${height(AccountFaqMetrics.rowTag(1))},
                  "radius": ${AccountFaqMetrics.cardRadius.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-faq/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(AccountFaqMetrics.rowTag(0), useUnmergedTree = true).captureRoboImage(File(dir, "app.png").path)
    }
}
