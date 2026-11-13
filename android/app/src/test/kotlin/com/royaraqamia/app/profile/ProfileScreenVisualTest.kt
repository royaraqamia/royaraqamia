package com.royaraqamia.app.profile

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
import com.royaraqamia.app.community.CommunityFeedMetrics
import com.royaraqamia.app.contracts.generated.CommunityMemberResponseMember
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItemAuthor
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItemStatus
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
 * The app's half of the visual gate for `/u/<username>` (#927, #1343, ADR-0118).
 *
 * It draws a member's profile at the width the page was recorded at - 393 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/profile/at-rest/app.json` and the posts heading's own pixels to
 * `app.png`, and `check:visual` compares them with the page's recording. A number
 * that differs is a failure that names the element and both values.
 *
 * The state is the gate's own fixture: the visual account, visible for the
 * recording, with one fixed post (ADR-0119). The avatar and the post are data, so
 * the contract names the header card, the name, the bio, the posts heading and the
 * first post card's structure rather than their words.
 *
 * The boxes are measured; the type sizes and weights the contract names are read
 * from [ProfileMetrics], the object the screen draws with, because Compose does
 * not expose resolved typography through the semantics tree. The raster is what
 * proves the type and the colours actually landed as declared.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class ProfileScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val member =
        CommunityMemberResponseMember(
            id = "u-1",
            username = "e2e-visual-user",
            name = "E2E Visual User",
            avatar_url = null,
            bio = "نبذة تعريفية للبوابة.",
            verified = true,
        )

    private val post =
        CommunityMemberResponsePostsItem(
            id = "p-1",
            author_id = "u-1",
            slug = "e2e-visual-profile-post",
            content = "منشور تجريبي لصفحة العضو",
            status = CommunityMemberResponsePostsItemStatus.PUBLISHED,
            cover_image = null,
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
                CommunityMemberResponsePostsItemAuthor(
                    username = member.username,
                    name = member.name,
                    avatar_url = null,
                ),
        )

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        ProfileScreen(
                            state = ProfileUiState.AtRest(member, listOf(post)),
                            failure = null,
                            onRetry = {},
                            onOpenPost = {},
                            onOpenProfile = {},
                        )
                    }
                }
            }
        }

        compose.waitUntil(10_000) {
            compose
                .onAllNodesWithTag(ProfileMetrics.POSTS, useUnmergedTree = true)
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

        val json =
            """
            {
              "surface": "profile",
              "elements": {
                "profile-header": {
                  "width": ${width(ProfileMetrics.HEADER)},
                  "radius": ${ProfileMetrics.HEADER_RADIUS.toFloat()}
                },
                "profile-name": {
                  "height": ${height(ProfileMetrics.NAME)},
                  "fontSize": ${ProfileMetrics.NAME_FONT_SIZE},
                  "fontWeight": 700,
                  "lineHeight": ${ProfileMetrics.NAME_LINE_HEIGHT}
                },
                "profile-bio": {
                  "height": ${height(ProfileMetrics.BIO)},
                  "fontSize": ${ProfileMetrics.BIO_FONT_SIZE},
                  "lineHeight": ${ProfileMetrics.BIO_LINE_HEIGHT}
                },
                "profile-posts": {
                  "width": ${width(ProfileMetrics.POSTS)},
                  "height": ${height(ProfileMetrics.POSTS)},
                  "fontSize": ${ProfileMetrics.POSTS_FONT_SIZE},
                  "fontWeight": 700,
                  "lineHeight": ${ProfileMetrics.POSTS_LINE_HEIGHT}
                },
                "first-post": {
                  "width": ${width(CommunityFeedMetrics.CARD)},
                  "radius": ${CommunityFeedMetrics.CARD_RADIUS.toFloat()}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/profile/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose
            .onNodeWithTag(ProfileMetrics.POSTS, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
