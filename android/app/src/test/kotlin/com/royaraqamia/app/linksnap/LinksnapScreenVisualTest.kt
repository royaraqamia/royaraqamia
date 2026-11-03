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
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/linksnap` (#654, ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/linksnap/app.json` and the card's own pixels to `app.png`, and
 * `check:visual` compares them with the page's recording. A number that differs is
 * a failure that names the element and both values.
 *
 * The screen is composed signed out, which is the page at rest: the site's
 * `/linksnap` is the shortener for a visitor with no session too, and the guest
 * sentence is part of the card rather than a gate in front of it.
 *
 * The boxes are measured; the type sizes and weights are read from
 * [LinksnapMetrics], the object the screen draws with, because Compose does not
 * expose resolved typography through the semantics tree. The raster is what proves
 * the type actually landed as declared.
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
class LinksnapScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapShortenerScreen(
                            shorten = { ShortenOutcome.Failed("") },
                            siteUrl = "https://royaraqamia.com",
                            signedIn = false,
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
              "surface": "linksnap",
              "elements": {
                "title": {
                  "top": ${top(LinksnapMetrics.TITLE)},
                  "height": ${height(LinksnapMetrics.TITLE)},
                  "fontSize": ${LinksnapMetrics.titleSize.value},
                  "fontWeight": ${LinksnapMetrics.titleWeight.weight}
                },
                "card": {
                  "top": ${top(LinksnapMetrics.CARD)},
                  "width": ${width(LinksnapMetrics.CARD)},
                  "height": ${height(LinksnapMetrics.CARD)},
                  "radius": ${LinksnapMetrics.cardRadius.value},
                  "paddingTop": ${LinksnapMetrics.cardPadding.value},
                  "paddingLeft": ${LinksnapMetrics.cardPadding.value}
                },
                "label": {
                  "top": ${top(LinksnapMetrics.LABEL)},
                  "height": ${height(LinksnapMetrics.LABEL)},
                  "fontSize": ${LinksnapMetrics.labelSize.value},
                  "fontWeight": ${LinksnapMetrics.labelWeight.weight}
                },
                "input": {
                  "width": ${width(LinksnapMetrics.INPUT)},
                  "height": ${height(LinksnapMetrics.INPUT)},
                  "fontSize": ${LinksnapMetrics.fieldTextSize.value},
                  "paddingLeft": ${LinksnapMetrics.fieldPadding.value},
                  "paddingRight": ${LinksnapMetrics.fieldPadding.value}
                },
                "hint": {
                  "top": ${top(LinksnapMetrics.HINT)},
                  "width": ${width(LinksnapMetrics.HINT)},
                  "height": ${height(LinksnapMetrics.HINT)},
                  "fontSize": ${LinksnapMetrics.hintSize.value}
                },
                "submit": {
                  "width": ${width(LinksnapMetrics.SUBMIT)},
                  "height": ${height(LinksnapMetrics.SUBMIT)},
                  "fontSize": ${LinksnapMetrics.buttonTextSize.value},
                  "fontWeight": ${LinksnapMetrics.buttonWeight.weight}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/linksnap").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(LinksnapMetrics.CARD).captureRoboImage(File(dir, "app.png").path)
    }
}
