package com.royaraqamia.app.habitflow

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
import com.royaraqamia.app.store.habitflow.HabitRow
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/habitflow` (#898, ADR-0118).
 *
 * It draws the list at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/habitflow/<state>/app.json` and the state's region to `app.png`,
 * and `check:visual` compares them with the page's recording. A number that
 * differs is a failure that names the element and both values.
 *
 * Two states, because the list has two: the empty state the page draws with no
 * habits, and the heading with its count when there is one. The row below the
 * heading is not part of this contract yet; the page's row is a card the app's
 * list has not been ported onto, and the gate names only what both clients draw.
 *
 * The boxes are measured; the type sizes and paddings the contract names are read
 * from [HabitflowMetrics], the object the screen draws with, because Compose does
 * not expose resolved typography through the semantics tree. The raster is what
 * proves the type and the colours actually landed as declared.
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
class HabitflowScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val habit =
        HabitRow(
            id = "habit-1",
            name = "قراءة",
            frequency = "daily",
            createdAt = "2026-11-05T06:26:43.000Z",
            archived = false,
            target = null,
            targetPeriod = null,
            reminderTime = null,
            clientId = "client-1",
            updatedAt = "2026-11-05T06:26:43.000Z",
            deletedAt = null,
        )

    private fun top(tag: String) =
        compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value

    private fun width(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.right - box.left).value
    }

    private fun height(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.bottom - box.top).value
    }

    private fun compose(state: HabitflowUiState) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        HabitflowScreen(state = state)
                    }
                }
            }
        }
    }

    @Test
    fun `the empty list records the page's heading and empty state`() {
        compose(HabitflowUiState.Empty)

        val json =
            """
            {
              "surface": "habitflow",
              "elements": {
                "title": {
                  "top": ${top(HabitflowMetrics.TITLE)},
                  "height": ${height(HabitflowMetrics.TITLE)},
                  "fontSize": ${HabitflowMetrics.titleSize.value},
                  "fontWeight": ${HabitflowMetrics.titleWeight.weight}
                },
                "list": {
                  "top": ${top(HabitflowMetrics.LIST)},
                  "width": ${width(HabitflowMetrics.LIST)},
                  "rowGap": ${HabitflowMetrics.listGap.value}
                },
                "header": {
                  "top": ${top(HabitflowMetrics.HEADER)},
                  "width": ${width(HabitflowMetrics.HEADER)},
                  "height": ${height(HabitflowMetrics.HEADER)},
                  "paddingBottom": ${HabitflowMetrics.headerPaddingBottom.value}
                },
                "empty": {
                  "top": ${top(HabitflowMetrics.EMPTY)},
                  "width": ${width(HabitflowMetrics.EMPTY)},
                  "height": ${height(HabitflowMetrics.EMPTY)},
                  "radius": ${HabitflowMetrics.emptyRadius.value},
                  "paddingTop": ${HabitflowMetrics.emptyPadding.value},
                  "paddingLeft": ${HabitflowMetrics.emptyPaddingX.value}
                },
                "empty-icon": {
                  "width": ${width(HabitflowMetrics.EMPTY_ICON)},
                  "height": ${height(HabitflowMetrics.EMPTY_ICON)},
                  "radius": ${HabitflowMetrics.iconTileRadius.value}
                },
                "empty-title": {
                  "top": ${top(HabitflowMetrics.EMPTY_TITLE)},
                  "height": ${height(HabitflowMetrics.EMPTY_TITLE)},
                  "fontSize": ${HabitflowMetrics.emptyTitleSize.value},
                  "fontWeight": ${HabitflowMetrics.emptyTitleWeight.weight}
                },
                "empty-body": {
                  "top": ${top(HabitflowMetrics.EMPTY_BODY)},
                  "width": ${width(HabitflowMetrics.EMPTY_BODY)},
                  "height": ${height(HabitflowMetrics.EMPTY_BODY)},
                  "fontSize": ${HabitflowMetrics.emptyBodySize.value},
                  "lineHeight": ${HabitflowMetrics.emptyBodyLineHeight.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/habitflow/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(HabitflowMetrics.EMPTY, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the list with a habit records the page's heading and count`() {
        compose(HabitflowUiState.Painted(listOf(habit)))

        val json =
            """
            {
              "surface": "habitflow",
              "elements": {
                "title": {
                  "top": ${top(HabitflowMetrics.TITLE)},
                  "height": ${height(HabitflowMetrics.TITLE)},
                  "fontSize": ${HabitflowMetrics.titleSize.value},
                  "fontWeight": ${HabitflowMetrics.titleWeight.weight}
                },
                "list": {
                  "top": ${top(HabitflowMetrics.LIST)},
                  "width": ${width(HabitflowMetrics.LIST)},
                  "rowGap": ${HabitflowMetrics.listGap.value}
                },
                "header": {
                  "top": ${top(HabitflowMetrics.HEADER)},
                  "width": ${width(HabitflowMetrics.HEADER)},
                  "height": ${height(HabitflowMetrics.HEADER)},
                  "paddingBottom": ${HabitflowMetrics.headerPaddingBottom.value}
                },
                "count": {
                  "top": ${top(HabitflowMetrics.COUNT)},
                  "height": ${height(HabitflowMetrics.COUNT)},
                  "fontSize": ${HabitflowMetrics.countTextSize.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/habitflow/with-count").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(HabitflowMetrics.HEADER, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
