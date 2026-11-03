package com.royaraqamia.app.verify

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
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/verify` (#874, ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at — 393 x 852 CSS px,
 * Arabic, RTL, dark — writes every contract element's numbers to
 * `e2e/__visual__/verify/app.json` and the card's own pixels to `app.png`, and
 * `check:visual` compares them with the page's recording. A number that differs is
 * a failure that names the element and both values.
 *
 * The boxes are measured; the type sizes and weights are read from
 * [VerifyMetrics], the object the screen draws with, because Compose does not
 * expose resolved typography through the semantics tree. The raster is what proves
 * the type actually landed as declared.
 *
 * The screen is composed inside a 393dp-wide box because the window is
 * 1080 px at DPR 2.75, which is 392.7dp: the page is 393 CSS px and the boxes have
 * to be measured in the same units.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class VerifyScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        VerifyScreen(
                            verify = { ApiResult.Success(VerifyResult(success = false)) },
                            onCopy = {},
                            onOpenScan = {},
                        )
                    }
                }
            }
        }

        fun top(tag: String) = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot().top.value
        fun width(tag: String): Float {
            val box = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()
            return (box.right - box.left).value
        }

        fun height(tag: String): Float {
            val box = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()
            return (box.bottom - box.top).value
        }

        val json =
            """
            {
              "surface": "verify",
              "elements": {
                "title": {
                  "top": ${top(VerifyMetrics.TITLE)},
                  "height": ${height(VerifyMetrics.TITLE)},
                  "fontSize": ${VerifyMetrics.titleSize.value},
                  "fontWeight": ${VerifyMetrics.titleWeight.weight}
                },
                "card": {
                  "top": ${top(VerifyMetrics.CARD)},
                  "width": ${width(VerifyMetrics.CARD)},
                  "height": ${height(VerifyMetrics.CARD)},
                  "radius": ${VerifyMetrics.cardRadius.value},
                  "paddingTop": ${VerifyMetrics.cardPadding.value},
                  "paddingLeft": ${VerifyMetrics.cardPadding.value}
                },
                "code-input": {
                  "width": ${width(VerifyMetrics.INPUT)},
                  "height": ${height(VerifyMetrics.INPUT)},
                  "radius": ${VerifyMetrics.fieldRadius.value},
                  "fontSize": ${VerifyMetrics.fieldTextSize.value},
                  "paddingLeft": ${VerifyMetrics.fieldPadding.value},
                  "paddingRight": ${VerifyMetrics.fieldPadding.value}
                },
                "submit": {
                  "width": ${width(VerifyMetrics.SUBMIT)},
                  "height": ${height(VerifyMetrics.SUBMIT)},
                  "radius": ${VerifyMetrics.buttonRadius.value},
                  "fontSize": ${VerifyMetrics.buttonTextSize.value},
                  "fontWeight": ${VerifyMetrics.buttonWeight.weight}
                },
                "hint": {
                  "top": ${top(VerifyMetrics.HINT)},
                  "width": ${width(VerifyMetrics.HINT)},
                  "height": ${height(VerifyMetrics.HINT)},
                  "fontSize": ${VerifyMetrics.hintTextSize.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/verify/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(VerifyMetrics.CARD).captureRoboImage(File(dir, "app.png").path)
    }
}
