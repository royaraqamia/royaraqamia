package com.royaraqamia.app.quran

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
 * The app's half of the visual gate for `/quran` (#955, ADR-0118).
 *
 * It draws the index at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/quran/at-rest/app.json` and the first sura row's own pixels to
 * `app.png`. `check:visual` compares them with the page's recording; a number
 * that differs names the element and both values.
 *
 * The list is read from the same vendored assets the screen reads, so the
 * recording is of the real 114 suras rather than a fixture that could drift.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class QuranIndexScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        val context = RuntimeEnvironment.getApplication()
        val repository = AssetQuranRepository(context, PreferencesQuranPositionStore(context))
        val index = repository.index()
        val pages = repository.pages()

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        QuranIndexScreen(
                            index = index,
                            pages = pages,
                            position = null,
                            loadSearch = null,
                            onOpenSurah = {},
                            onOpenAyah = { _, _ -> },
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
              "surface": "quran",
              "elements": {
                "title": {
                  "top": ${top(QuranIndexMetrics.TITLE)},
                  "height": ${height(QuranIndexMetrics.TITLE)},
                  "fontSize": ${QuranIndexMetrics.titleSize.value},
                  "fontWeight": ${QuranIndexMetrics.titleWeight.weight}
                },
                "search": {
                  "top": ${top(QuranIndexMetrics.SEARCH)},
                  "width": ${width(QuranIndexMetrics.SEARCH)},
                  "height": ${height(QuranIndexMetrics.SEARCH)},
                  "radius": ${QuranIndexMetrics.searchRadius.value},
                  "fontSize": ${QuranIndexMetrics.searchTextSize.value},
                  "paddingLeft": ${QuranIndexMetrics.searchHorizontalPadding.value},
                  "paddingRight": ${QuranIndexMetrics.searchHorizontalPadding.value}
                },
                "list": {
                  "top": ${top(QuranIndexMetrics.LIST)},
                  "width": ${width(QuranIndexMetrics.LIST)},
                  "rowGap": ${QuranIndexMetrics.listGap.value}
                },
                "first-row": {
                  "top": ${top(QuranIndexMetrics.rowTag(0))},
                  "width": ${width(QuranIndexMetrics.rowTag(0))},
                  "height": ${height(QuranIndexMetrics.rowTag(0))},
                  "radius": ${QuranIndexMetrics.rowRadius.value}
                },
                "first-row-number": {
                  "width": ${width(QuranIndexMetrics.numberTag(0))},
                  "height": ${height(QuranIndexMetrics.numberTag(0))},
                  "radius": ${QuranIndexMetrics.numberRadius.value},
                  "fontSize": ${QuranIndexMetrics.numberTextSize.value},
                  "fontWeight": 700
                },
                "first-row-name": {
                  "height": ${height(QuranIndexMetrics.nameTag(0))},
                  "fontSize": ${QuranIndexMetrics.rowNameSize.value},
                  "fontWeight": 700
                },
                "first-row-meta": {
                  "height": ${height(QuranIndexMetrics.metaTag(0))},
                  "fontSize": ${QuranIndexMetrics.rowMetaSize.value}
                },
                "page-jump": {
                  "width": ${width(QuranIndexMetrics.PAGE_JUMP)},
                  "height": ${height(QuranIndexMetrics.PAGE_JUMP)},
                  "radius": 16.0,
                  "paddingTop": 12.0,
                  "paddingLeft": 16.0
                },
                "page-jump-field": {
                  "width": ${width(QuranIndexMetrics.PAGE_JUMP_FIELD)},
                  "height": ${height(QuranIndexMetrics.PAGE_JUMP_FIELD)},
                  "radius": 9.6,
                  "fontSize": 14.0,
                  "paddingLeft": 9.6,
                  "paddingRight": 9.6
                },
                "page-jump-submit": {
                  "width": ${width(QuranIndexMetrics.PAGE_JUMP_SUBMIT)},
                  "height": ${height(QuranIndexMetrics.PAGE_JUMP_SUBMIT)},
                  "radius": 9.6,
                  "fontSize": 13.0,
                  "fontWeight": 700
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/quran/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        compose
            .onNodeWithTag(QuranIndexMetrics.rowTag(0), useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
