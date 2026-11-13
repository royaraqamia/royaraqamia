package com.royaraqamia.app.community

import androidx.compose.foundation.background
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
import com.royaraqamia.app.contracts.generated.CommunityPostResponse
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePost
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostAuthor
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostStatus
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostTagsItem
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/community/<slug>` (#922, #1351, ADR-0118).
 *
 * It draws one published post at the viewport the page was recorded at - 393 x
 * 852 CSS px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/community-post/at-rest/app.json` and the Markdown body's own
 * pixels to `app.png`, and `check:visual` compares them with the page's
 * recording. A number that differs is a failure that names the element and both
 * values.
 *
 * The post is the gate's own fixture (#1351): one fixed published row with a
 * cover, one tag and a plain Markdown body, written through the page's own create
 * route. The words are data, so the contract names the column, the pill, the
 * cover and the body's box rather than the text; the body's raster is what proves
 * the app's Markdown renderer draws the same nodes as the page's (ADR-0098).
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
class CommunityPostScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val content =
        "## عنوان تجريبي\n\n" +
            "هذا نص تجريبي لمنشور البوابة، يقيس الخطّ والمسافة بين السطور على الشاشتين.\n\n" +
            "- البند الأوّل\n" +
            "- البند الثاني"

    private val response =
        CommunityPostResponse(
            post =
                CommunityPostResponsePost(
                    id = "p-1",
                    author_id = "u-1",
                    slug = "e2e-visual-post",
                    content = content,
                    status = CommunityPostResponsePostStatus.PUBLISHED,
                    cover_image = "/01.webp",
                    meta_title = null,
                    meta_desc = null,
                    published_at = "2026-11-13T00:00:00.000Z",
                    publish_at = null,
                    view_count = 0,
                    featured = false,
                    community_visible = true,
                    reading_time_minutes = 1,
                    created_at = "2026-11-13T00:00:00.000Z",
                    updated_at = "2026-11-13T00:00:00.000Z",
                    author =
                        CommunityPostResponsePostAuthor(
                            username = "e2e-visual-user",
                            name = "E2E Visual User",
                            avatar_url = null,
                        ),
                ),
            postTags =
                listOf(
                    CommunityPostResponsePostTagsItem(
                        id = "t-1",
                        name = "تجريبي",
                        slug = "e2e-visual-tag",
                    )
                ),
        )

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        CommunityPostScreen(
                            state = CommunityPostUiState.AtRest(response),
                            failure = null,
                            onRetry = {},
                            onOpenProfile = {},
                        )
                    }
                }
            }
        }

        compose.waitUntil(timeoutMillis = 10_000) {
            compose
                .onAllNodesWithTag(CommunityPostMetrics.BODY, useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        fun width(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.right - box.left).value
        }
        fun height(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.bottom - box.top).value
        }
        fun top(tag: String): Float =
            compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value

        val json =
            """
            {
              "surface": "community-post",
              "elements": {
                "post": {
                  "width": ${width(CommunityPostMetrics.POST)},
                  "top": ${top(CommunityPostMetrics.POST)}
                },
                "author": {
                  "width": ${width(CommunityPostMetrics.AUTHOR)},
                  "height": ${height(CommunityPostMetrics.AUTHOR)}
                },
                "cover": {
                  "width": ${width(CommunityPostMetrics.COVER)},
                  "height": ${height(CommunityPostMetrics.COVER)},
                  "radius": ${CommunityPostMetrics.COVER_RADIUS.toFloat()}
                },
                "tags": {
                  "width": ${width(CommunityPostMetrics.TAGS)},
                  "height": ${height(CommunityPostMetrics.TAGS)}
                },
                "body": {
                  "width": ${width(CommunityPostMetrics.BODY)},
                  "top": ${top(CommunityPostMetrics.BODY)}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/community-post/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose
            .onNodeWithTag(CommunityPostMetrics.BODY, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
