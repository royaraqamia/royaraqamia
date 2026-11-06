package com.royaraqamia.app.linksnap

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
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/linksnap/unlock/<code>` (#919,
 * ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at - 393 x 852 CSS
 * px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/linksnap-unlock/at-rest/app.json` and the card's own pixels to
 * `app.png`, and `check:visual` compares them with the page's recording. A number
 * that differs is a failure that names the element and both values.
 *
 * The screen is composed inside a 393dp-wide box because the window is 1080 px at
 * DPR 2.75, which is 392.7dp: the page is 393 CSS px and the boxes have to be
 * measured in the same units.
 *
 * The boxes are measured; the type sizes and weights are read from
 * [LinksnapUnlockMetrics], the object the screen draws with, because Compose does
 * not expose resolved typography through the semantics tree. The raster is what
 * proves the type actually landed as declared.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class LinksnapUnlockScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapUnlockScreen(
                            code = "COMP-2026-UHVW9SG5",
                            unlock = { ApiResult.Failure(ApiError.Network("offline")) },
                            onOpenUrl = {},
                            onBack = {},
                        )
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

        // Both clients draw a pill; the page states it as `border-radius: 9999px`
        // and Compose as 50% of the box, so the semantic value is the page's.
        val pillRadius = 9999

        val json =
            """
            {
              "surface": "linksnap-unlock",
              "elements": {
                "title": {
                  "top": ${top(LinksnapUnlockMetrics.TITLE)},
                  "height": ${height(LinksnapUnlockMetrics.TITLE)},
                  "fontSize": ${LinksnapUnlockMetrics.titleSize.value},
                  "fontWeight": ${LinksnapUnlockMetrics.titleWeight.weight}
                },
                "card": {
                  "top": ${top(LinksnapUnlockMetrics.CARD)},
                  "width": ${width(LinksnapUnlockMetrics.CARD)},
                  "height": ${height(LinksnapUnlockMetrics.CARD)},
                  "radius": ${LinksnapUnlockMetrics.cardRadius.value},
                  "paddingTop": ${LinksnapUnlockMetrics.cardPadding.value},
                  "paddingLeft": ${LinksnapUnlockMetrics.cardPadding.value}
                },
                "badge": {
                  "top": ${top(LinksnapUnlockMetrics.BADGE)},
                  "height": ${height(LinksnapUnlockMetrics.BADGE)},
                  "fontSize": ${LinksnapUnlockMetrics.badgeSize.value},
                  "fontWeight": ${androidx.compose.ui.text.font.FontWeight.Medium.weight}
                },
                "body": {
                  "top": ${top(LinksnapUnlockMetrics.BODY)},
                  "height": ${height(LinksnapUnlockMetrics.BODY)},
                  "fontSize": ${LinksnapUnlockMetrics.bodySize.value}
                },
                "code": {
                  "top": ${top(LinksnapUnlockMetrics.CODE)},
                  "height": ${height(LinksnapUnlockMetrics.CODE)},
                  "fontSize": ${LinksnapUnlockMetrics.codeSize.value},
                  "fontWeight": ${LinksnapUnlockMetrics.codeWeight.weight}
                },
                "input": {
                  "width": ${width(LinksnapUnlockMetrics.INPUT)},
                  "height": ${height(LinksnapUnlockMetrics.INPUT)},
                  "fontSize": ${LinksnapUnlockMetrics.inputTextSize.value},
                  "paddingLeft": ${LinksnapUnlockMetrics.inputPadding.value},
                  "paddingRight": ${LinksnapUnlockMetrics.inputPadding.value + LinksnapUnlockMetrics.inputIcon.value + LinksnapUnlockMetrics.inputIconGap.value}
                },
                "submit": {
                  "width": ${width(LinksnapUnlockMetrics.SUBMIT)},
                  "height": ${height(LinksnapUnlockMetrics.SUBMIT)},
                  "fontSize": ${LinksnapUnlockMetrics.buttonTextSize.value},
                  "fontWeight": ${LinksnapUnlockMetrics.buttonWeight.weight}
                },
                "back": {
                  "top": ${top(LinksnapUnlockMetrics.BACK)},
                  "height": ${height(LinksnapUnlockMetrics.BACK)},
                  "fontSize": ${LinksnapUnlockMetrics.backSize.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/linksnap-unlock/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(LinksnapUnlockMetrics.CARD, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
