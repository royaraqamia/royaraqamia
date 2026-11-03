package com.royaraqamia.app.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for the frame (#902, ADR-0118).
 *
 * It composes the shell's own [ShellFrame] - not a copy of its bars - at the
 * viewport the page was recorded at (393 x 852 CSS px, Arabic, RTL, dark), writes
 * every contract element's numbers to `e2e/__visual__/chrome/app.json`, and
 * `check:visual` compares them with the page's recording. A number that differs
 * is a failure that names the element and both values.
 *
 * The frame is one recording rather than one per screen because it is drawn once,
 * before any screen: measuring it per surface would measure the same bars thirty
 * times and still not say which of them moved. The bars' boxes are measured; the
 * type sizes and weights are read from the objects the bars draw with
 * ([TabLabelSize], [ServicesLabelWeight], the theme's typography), because Compose
 * does not expose resolved typography through the semantics tree. There is no
 * raster: the page's bars are glass over its own content, and the account tab
 * carries the member's avatar over it, so the frame's pixels are not the frame's
 * (the gate entry's `why` says so).
 *
 * The screen is composed inside a 393 x 852 dp box because the window is 1080 px
 * at DPR 2.75, which is 392.7dp: the page is 393 CSS px and the boxes have to be
 * measured in the same units.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class ShellFrameVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the frame records the same numbers as the page`() {
        var typography: Typography? = null

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    typography = MaterialTheme.typography
                    Box(Modifier.width(393.dp).height(852.dp)) {
                        ShellFrame(
                            currentRoute = Routes.HOME,
                            onSelect = {},
                            onOpenRoute = {},
                            // A guest with no unread rows: the bell is drawn, its badge
                            // is not - the badge is a count, and the frame at rest has
                            // none to draw.
                            unreadCount = 0,
                        )
                    }
                }
            }
        }

        val type = checkNotNull(typography)
        val servicesSize = type.labelLarge.fontSize.value
        fun bounds(tag: String) = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()
        fun top(tag: String) = bounds(tag).top.value
        fun left(tag: String) = bounds(tag).left.value
        fun width(tag: String): Float {
            val box = bounds(tag)
            return (box.right - box.left).value
        }

        fun height(tag: String): Float {
            val box = bounds(tag)
            return (box.bottom - box.top).value
        }

        fun tab(label: String, tab: ShellTab) =
            """
                "$label": {
                  "width": ${width(tabTestTag(tab))},
                  "height": ${height(tabTestTag(tab))},
                  "radius": ${TabRadius.value},
                  "fontSize": ${TabLabelSize.value},
                  "fontWeight": ${TabLabelWeight.weight}
                }
            """.trimIndent()

        val json =
            """
            {
              "surface": "chrome",
              "elements": {
                "topbar": {
                  "height": ${height(ChromeTags.TOP_BAR)}
                },
                "mark": {
                  "top": ${top(ChromeTags.MARK)},
                  "left": ${left(ChromeTags.MARK)},
                  "width": ${width(ChromeTags.MARK)},
                  "height": ${height(ChromeTags.MARK)}
                },
                "services": {
                  "top": ${top(ChromeTags.SERVICES)},
                  "height": ${height(ChromeTags.SERVICES)},
                  "fontSize": $servicesSize,
                  "fontWeight": ${ServicesLabelWeight.weight}
                },
                "bell": {
                  "top": ${top(ChromeTags.BELL)},
                  "left": ${left(ChromeTags.BELL)},
                  "width": ${width(ChromeTags.BELL)},
                  "height": ${height(ChromeTags.BELL)}
                },
                "tabbar": {
                  "top": ${top(ChromeTags.TAB_BAR)},
                  "height": ${height(ChromeTags.TAB_BAR)}
                },
                ${tab("tab-home", ShellTab.Home)},
                ${tab("tab-community", ShellTab.Community)},
                ${tab("tab-account", ShellTab.Account)}
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/chrome/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        // No raster: the frame's gate entry declares `raster: "none"` and says why
        // (the page's bars are glass over its own content), so the numbers are the
        // whole recording.
    }
}
