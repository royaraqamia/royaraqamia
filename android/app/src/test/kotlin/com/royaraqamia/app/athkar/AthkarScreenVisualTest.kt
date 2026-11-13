package com.royaraqamia.app.athkar

import androidx.compose.foundation.background
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
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/athkar` and `/athkar/evening`
 * (#1389, ADR-0118).
 *
 * It draws each sitting at the viewport the page was recorded at - 393 x 852 CSS
 * px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/athkar/<state>/app.json` and the first dhikr card's own pixels
 * to `app.png`. `check:visual` compares them with the page's recording; a
 * number that differs names the element and both values.
 *
 * The text and the counts are the real vendored ones, so the recording is of the
 * first dhikr as the site ships it rather than a fixture that could drift.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class AthkarScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the morning screen records the same numbers as the page`() {
        record(AthkarPeriod.Morning, "at-rest")
    }

    @Test
    fun `the evening screen records the same numbers as the page`() {
        record(AthkarPeriod.Evening, "evening")
    }

    private fun record(period: AthkarPeriod, state: String) {
        val context = RuntimeEnvironment.getApplication()
        val repository = AssetAthkarRepository(context)
        val collections = AthkarPeriod.entries.associateWith { repository.collection(it) }

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        AthkarScreen(
                            collections = collections,
                            period = period,
                            counts = AthkarCounts(day = "2026-11-13"),
                            ready = true,
                            onSelectPeriod = {},
                            onIncrement = { _, _, _ -> },
                            onReset = { _, _ -> },
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

        val json =
            """
            {
              "surface": "athkar",
              "elements": {
                "title": {
                  "top": ${top(AthkarMetrics.TITLE)},
                  "height": ${height(AthkarMetrics.TITLE)},
                  "fontSize": ${AthkarMetrics.titleSize.value},
                  "fontWeight": ${AthkarMetrics.titleWeight.weight},
                  "lineHeight": ${AthkarMetrics.titleLineHeight.value}
                },
                "tabs": {
                  "top": ${top(AthkarMetrics.TABS)},
                  "height": ${height(AthkarMetrics.TABS)},
                  "rowGap": ${AthkarMetrics.tabsGap.value}
                },
                "tab-morning": {
                  "height": ${height(AthkarMetrics.tabTag(0))},
                  "fontSize": ${AthkarMetrics.tabTextSize.value},
                  "fontWeight": ${AthkarMetrics.tabWeight.weight},
                  "paddingLeft": ${AthkarMetrics.tabPadding.value},
                  "paddingRight": ${AthkarMetrics.tabPadding.value}
                },
                "list": {
                  "top": ${top(AthkarMetrics.LIST)},
                  "width": ${width(AthkarMetrics.LIST)},
                  "rowGap": ${AthkarMetrics.listGap.value}
                },
                "first-card": {
                  "top": ${top(AthkarMetrics.cardTag(0))},
                  "width": ${width(AthkarMetrics.cardTag(0))},
                  "height": ${height(AthkarMetrics.cardTag(0))},
                  "radius": ${AthkarMetrics.cardRadius.value},
                  "paddingTop": ${AthkarMetrics.cardPadding.value},
                  "paddingLeft": ${AthkarMetrics.cardPadding.value}
                },
                "first-text": {
                  "height": ${height(AthkarMetrics.textTag(0))},
                  "fontSize": ${AthkarMetrics.textSize.value},
                  "lineHeight": ${AthkarMetrics.textLineHeight.value}
                },
                "first-count": {
                  "height": ${height(AthkarMetrics.countTag(0))},
                  "fontSize": ${AthkarMetrics.countTextSize.value},
                  "fontWeight": 700
                },
                "first-source": {
                  "height": ${height(AthkarMetrics.sourceTag(0))},
                  "fontSize": ${AthkarMetrics.sourceTextSize.value},
                  "lineHeight": ${AthkarMetrics.sourceLineHeight.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/athkar/$state").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        compose
            .onNodeWithTag(AthkarMetrics.cardTag(0), useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
