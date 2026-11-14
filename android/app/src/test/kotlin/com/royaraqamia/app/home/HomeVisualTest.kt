package com.royaraqamia.app.home

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.shell.AppsSheetMetrics
import com.royaraqamia.app.shell.PickerMetrics
import com.royaraqamia.app.shell.ServicesSheet
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.theme.LocalRoyTypeScale
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for the homepage (#1194, ADR-0118).
 *
 * It draws the three states `shared/visual/home.json` declares — the strip, the
 * picker and the first-run empty state — at the viewport the page was recorded
 * at (393 x 852 CSS px, Arabic, RTL, dark), and writes every contract element's
 * numbers to `e2e/__visual__/home/<state>/app.json` with the state's own pixels
 * beside them.
 *
 * The regions are the contract's `capture` elements: the strip row, the sheet,
 * and the first-run card. The page's frame and the app's are not the same
 * height, so a viewport capture would compare two chromes; the card is the
 * region both clients draw identically (the same rule the dialogs follow).
 *
 * The empty state is composed in the frame's content box: `100dvh - 8rem` is the
 * page's own way of saying "everything the two bars leave", and 852 - 128 is
 * that box at this viewport.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class HomeVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the strip records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        Box(Modifier.width(393.dp)) {
                            HomeTabStrip(
                                order = listOf("/quran", "/rates"),
                                selected = "/quran",
                                onSelect = {},
                                onAddApp = {},
                            )
                        }
                    }
                }
            }
        }
        compose.waitForIdle()

        val strip = boxOf("home-app-strip")
        val newApp = boxOf("home-new-app")

        val json =
            """
            {
              "surface": "home",
              "state": "strip",
              "elements": {
                "strip": {
                  "top": ${strip.top.value},
                  "width": ${widthOf("home-app-strip")},
                  "height": ${heightOf("home-app-strip")},
                  "columnGap": "normal"
                },
                "new-app": {
                  "top": ${newApp.top.value},
                  "width": ${widthOf("home-new-app")},
                  "height": ${heightOf("home-new-app")},
                  "radius": $FULL_RADIUS,
                  "fontSize": ${HomeStripMetrics.pillTextSize.value},
                  "paddingLeft": ${HomeStripMetrics.pillHorizontalPadding.value}
                }
              }
            }
            """.trimIndent()

        val dir = evidence("strip")
        File(dir, "app.json").writeText(json)
        compose.onNodeWithTag("home-app-strip").captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the empty state records the same numbers as the page`() {
        var ctaTextSize = 0f
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        ctaTextSize = LocalRoyTypeScale.current.body.fontSize.value
                        Box(Modifier.width(393.dp).height(724.dp)) {
                            HomeEmptyState(onAddApp = {})
                        }
                    }
                }
            }
        }
        compose.waitForIdle()

        val title = boxOf("home-empty-title")
        val card = boxOf("home-empty")

        val json =
            """
            {
              "surface": "home",
              "state": "empty",
              "elements": {
                "title": {
                  "top": ${title.top.value},
                  "height": ${heightOf("home-empty-title")},
                  "fontSize": ${HomeEmptyMetrics.titleSize.value},
                  "fontWeight": ${HomeEmptyMetrics.titleWeight.weight}
                },
                "body": {
                  "top": ${boxOf("home-empty-body").top.value},
                  "height": ${heightOf("home-empty-body")},
                  "fontSize": ${HomeEmptyMetrics.bodySize.value}
                },
                "add": {
                  "width": ${widthOf("home-empty-add")},
                  "height": ${heightOf("home-empty-add")},
                  "radius": $FULL_RADIUS,
                  "fontSize": $ctaTextSize
                },
                "card": {
                  "top": ${card.top.value},
                  "width": ${widthOf("home-empty")},
                  "height": ${heightOf("home-empty")}
                }
              }
            }
            """.trimIndent()

        val dir = evidence("empty")
        File(dir, "app.json").writeText(json)
        compose.onNodeWithTag("home-empty").captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the picker records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Surface(color = MaterialTheme.colorScheme.background) {
                        Box(Modifier.width(393.dp).height(852.dp)) {
                            ServicesSheet(
                                open = true,
                                order = listOf("/quran", "/rates"),
                                busy = null,
                                error = null,
                                onToggle = {},
                                onDismiss = {},
                            )
                        }
                    }
                }
            }
        }
        compose.waitForIdle()

        val sheet = boxOf("services-sheet")
        val row = compose.onAllNodesWithTag("services-row")[0].getUnclippedBoundsInRoot()
        val action = compose.onAllNodesWithTag("services-row-action")[0].getUnclippedBoundsInRoot()
        val header = boxOf("apps-sheet-header")
        val tabInternal = boxOf("apps-tab-internal")
        val tabExternal = boxOf("apps-tab-external")
        val tabInbound = boxOf("apps-tab-inbound")
        val search = boxOf("apps-search")

        val json =
            """
            {
              "surface": "home",
              "state": "picker",
              "elements": {
                "sheet": {
                  "top": ${sheet.top.value},
                  "width": ${(sheet.right - sheet.left).value},
                  "height": ${(sheet.bottom - sheet.top).value},
                  "radius": 0,
                  "paddingTop": 0
                },
                "header": {
                  "top": ${header.top.value},
                  "height": ${(header.bottom - header.top).value},
                  "paddingTop": ${AppsSheetMetrics.headerPaddingTop.value}
                },
                "tab-internal": {
                  "top": ${tabInternal.top.value},
                  "width": ${(tabInternal.right - tabInternal.left).value},
                  "height": ${(tabInternal.bottom - tabInternal.top).value},
                  "radius": $FULL_RADIUS,
                  "fontSize": ${AppsSheetMetrics.tabTextSize.value},
                  "fontWeight": ${FontWeight.Bold.weight}
                },
                "tab-external": {
                  "top": ${tabExternal.top.value},
                  "width": ${(tabExternal.right - tabExternal.left).value},
                  "height": ${(tabExternal.bottom - tabExternal.top).value},
                  "radius": $FULL_RADIUS,
                  "fontSize": ${AppsSheetMetrics.tabTextSize.value},
                  "fontWeight": ${FontWeight.Bold.weight}
                },
                "tab-inbound": {
                  "top": ${tabInbound.top.value},
                  "width": ${(tabInbound.right - tabInbound.left).value},
                  "height": ${(tabInbound.bottom - tabInbound.top).value},
                  "radius": $FULL_RADIUS,
                  "fontSize": ${AppsSheetMetrics.tabTextSize.value},
                  "fontWeight": ${FontWeight.Bold.weight}
                },
                "search": {
                  "top": ${search.top.value},
                  "width": ${(search.right - search.left).value},
                  "height": ${(search.bottom - search.top).value},
                  "radius": ${AppsSheetMetrics.searchRadius.value},
                  "fontSize": ${AppsSheetMetrics.searchTextSize.value}
                },
                "row": {
                  "top": ${row.top.value},
                  "height": ${(row.bottom - row.top).value}
                },
                "row-action": {
                  "width": ${(action.right - action.left).value},
                  "height": ${(action.bottom - action.top).value},
                  "radius": $FULL_RADIUS,
                  "fontSize": ${PickerMetrics.rowActionTextSize.value}
                }
              }
            }
            """.trimIndent()

        val dir = evidence("picker")
        File(dir, "app.json").writeText(json)
        compose.onNodeWithTag("services-sheet").captureRoboImage(File(dir, "app.png").path)
    }

    private fun boxOf(tag: String) = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    private fun widthOf(tag: String) = (boxOf(tag).right - boxOf(tag).left).value

    private fun heightOf(tag: String) = (boxOf(tag).bottom - boxOf(tag).top).value

    private fun evidence(state: String): File =
        File("../../e2e/__visual__/home/$state").apply { mkdirs() }

    private companion object {
        /**
         * `rounded-full` as the page computes it: Tailwind resolves the radius to
         * an effectively infinite value and Chromium reports its float maximum,
         * so the pair records the same number rather than a second spelling of
         * "a pill".
         */
        const val FULL_RADIUS = 33554400
    }
}
