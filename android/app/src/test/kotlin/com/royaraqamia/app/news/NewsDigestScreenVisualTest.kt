package com.royaraqamia.app.news

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoard
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDay
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayDigest
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItem
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItemCategory
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItemRegion
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/news` (#1345, ADR-0118).
 *
 * It draws the surface's digest at the width the page was recorded at - 393 CSS
 * px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/news/<state>/app.json` and the contract's capture region to
 * `app.png`, and `check:visual` compares them with the page's recording.
 *
 * The board is a fixture, not the live digest: the gate measures the design, and
 * the page records the same seeded day (`e2e/visual-fixture.ts`), so both
 * clients draw one fixed headline and summary rather than whatever the nightly
 * workflow published (ADR-0119). The second state is the page's own offline
 * block, with no saved digest to paint.
 *
 * The boxes are measured; the type sizes and paddings the contract names are read
 * from [NewsDigestMetrics], the object the screen draws with, because Compose
 * does not expose resolved typography through the semantics tree.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class NewsDigestScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val date = "2026-01-15"

    private val board =
        NewsBoardResponseBoard(
            day =
                NewsBoardResponseBoardDay(
                    digest =
                        NewsBoardResponseBoardDayDigest(
                            id = "e2e00000-0000-4000-8000-00000000e134",
                            date = date,
                            title = "ملخّص تجريبي للبوابة",
                            lede = "مقدّمة تجريبية للبوابة.",
                            storyCount = 1,
                            model = "e2e-visual-gate",
                            publishedAt = "${date}T06:00:00.000Z",
                        ),
                    stories =
                        listOf(
                            NewsBoardResponseBoardDayStoriesItem(
                                id = "e2e00000-0000-4000-8000-00000000e135",
                                position = 1,
                                category = NewsBoardResponseBoardDayStoriesItemCategory.TECH,
                                region = NewsBoardResponseBoardDayStoriesItemRegion.ARAB,
                                headline = "خبر تجريبي لبوابة القياس",
                                summary =
                                    "ملخّص الخبر التجريبي الذي تقيسه البوابة على الشاشتين.",
                                whyItMatters = null,
                                sourceId = "e2e-visual-news",
                                sourceName = "مصدر تجريبي",
                                sourceUrl = "https://example.com/e2e-visual-news",
                                sourcePublishedAt = null,
                            )
                        ),
                ),
            dates = listOf(date, "2026-01-14"),
            search = null,
            hasAnyDigest = true,
            preferences = null,
            personal = null,
            cards = null,
        )

    private fun compose(state: NewsDigestUiState) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        NewsDigestScreen(state = state, date = date, onRetry = {})
                    }
                }
            }
        }
    }

    private fun bounds(tag: String) =
        compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()

    private fun top(tag: String) = bounds(tag).top.value
    private fun width(tag: String) = (bounds(tag).right - bounds(tag).left).value
    private fun height(tag: String) = (bounds(tag).bottom - bounds(tag).top).value

    private fun record(state: String, captureTag: String, elements: String) {
        val json = JSONObject("""{"surface":"news","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/news/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(captureTag, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    private fun waitFor(tag: String) {
        compose.waitUntil(10_000) {
            compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun titleElement() =
        """
        "title": {
          "height": ${height(NewsDigestMetrics.TITLE)},
          "fontSize": ${NewsDigestMetrics.TITLE_SIZE.value},
          "fontWeight": ${NewsDigestMetrics.TITLE_WEIGHT.weight},
          "lineHeight": ${NewsDigestMetrics.TITLE_LINE_HEIGHT.value}
        }
        """

    @Test
    fun `the digest records the same numbers as the page`() {
        compose(NewsDigestUiState.Live(board))
        waitFor(NewsDigestMetrics.STORY)

        record(
            state = "at-rest",
            captureTag = NewsDigestMetrics.STORY,
            elements =
                """
                ${titleElement()},
                "archive": {
                  "top": ${top(NewsDigestMetrics.ARCHIVE)},
                  "width": ${width(NewsDigestMetrics.ARCHIVE)},
                  "height": ${height(NewsDigestMetrics.ARCHIVE)}
                },
                "story": {
                  "top": ${top(NewsDigestMetrics.STORY)},
                  "width": ${width(NewsDigestMetrics.STORY)},
                  "height": ${height(NewsDigestMetrics.STORY)},
                  "radius": ${NewsDigestMetrics.STORY_RADIUS.value},
                  "paddingTop": ${NewsDigestMetrics.STORY_PADDING.value},
                  "paddingLeft": ${NewsDigestMetrics.STORY_PADDING.value}
                },
                "story-source": {
                  "height": ${height(NewsDigestMetrics.STORY_SOURCE)},
                  "fontSize": ${NewsDigestMetrics.STORY_META_SIZE.value},
                  "fontWeight": 700,
                  "paddingLeft": ${NewsDigestMetrics.STORY_SOURCE_PADDING.value}
                }
                """,
        )
    }

    @Test
    fun `the offline block records the page's own block`() {
        compose(NewsDigestUiState.Unavailable(offline = true))
        waitFor(NewsDigestMetrics.UNAVAILABLE)

        record(
            state = "needs-connection",
            captureTag = NewsDigestMetrics.UNAVAILABLE,
            elements =
                """
                ${titleElement()},
                "unavailable": {
                  "width": ${width(NewsDigestMetrics.UNAVAILABLE)},
                  "height": ${height(NewsDigestMetrics.UNAVAILABLE)}
                }
                """,
        )
    }
}
