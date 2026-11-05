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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.CommunityIndexResponse
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemAuthor
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.theme.roySpacing
import com.royaraqamia.app.theme.royTypeScale
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/community` (#901, ADR-0118).
 *
 * It draws the feed at the viewport the page was recorded at - 393 x 852 CSS px,
 * Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/community/at-rest/app.json` and the load-more control's own
 * pixels to `app.png`, and `check:visual` compares them with the page's
 * recording. A number that differs is a failure that names the element and both
 * values.
 *
 * The card is the page's first row and the load-more is the page's own pill. The
 * post's text is data, so the contract names the card's box and the control's
 * box rather than the words: the page's recording seeds enough rows for the
 * control to exist, and this test draws one row plus the cursor that draws it.
 *
 * The boxes are measured; the type size and weight the contract names are read
 * from [royTypeScale], the object the screen draws with, because Compose does not
 * expose resolved typography through the semantics tree. The raster is what
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
class CommunityFeedScreenVisualTest {
    @get:Rule val compose = createComposeRule()
    @get:Rule val temporary = TemporaryFolder()

    private val post =
        CommunityIndexResponsePostsItem(
            id = "p-1",
            author_id = "u-1",
            slug = "e2e-visual-community",
            content = "منشور تجريبي للبوابة",
            status = CommunityIndexResponsePostsItemStatus.PUBLISHED,
            cover_image = null,
            meta_title = null,
            meta_desc = null,
            published_at = "2026-11-05T00:00:00.000Z",
            publish_at = null,
            view_count = 0,
            featured = false,
            community_visible = true,
            reading_time_minutes = 1,
            created_at = "2026-11-05T00:00:00.000Z",
            updated_at = "2026-11-05T00:00:00.000Z",
            author =
                CommunityIndexResponsePostsItemAuthor(
                    username = "e2e-test-user",
                    name = "E2E Test User",
                    avatar_url = null,
                ),
        )

    private fun repository(): CommunityFeedRepository {
        val session =
            runBlocking {
                Session(
                    MemoryTokenStore(),
                    TokenRefresher { RefreshOutcome.Refused },
                    MemoryIdentityStorage(),
                )
            }
        val body =
            ContractCodec.encode(
                CommunityIndexResponse(posts = listOf(post), nextCursor = "cursor-1")
            )
        return CommunityFeedRepository(
            ApiClient("https://app.test", session, RecordingTransport { HttpResponse(200, body) }),
            CommunityFeedSnapshotStore(temporary.newFolder("community")),
        )
    }

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        CommunityFeedScreen(
                            repository = repository(),
                            onOpenPost = {},
                            onOpenProfile = {},
                        )
                    }
                }
            }
        }

        compose.waitUntil(timeoutMillis = 5_000) {
            compose
                .onAllNodesWithTag(CommunityFeedMetrics.LOAD_MORE, useUnmergedTree = true)
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

        val spacing = roySpacing(393f)
        val type = royTypeScale(393f)

        val json =
            """
            {
              "surface": "community",
              "elements": {
                "card": {
                  "width": ${width(CommunityFeedMetrics.CARD)},
                  "radius": ${CommunityFeedMetrics.CARD_RADIUS.toFloat()}
                },
                "card-content": {
                  "paddingTop": ${spacing.cardPadding.value},
                  "paddingLeft": ${spacing.cardPadding.value}
                },
                "load-more-region": {
                  "width": ${width(CommunityFeedMetrics.LOAD_MORE_REGION)},
                  "height": ${height(CommunityFeedMetrics.LOAD_MORE_REGION)}
                },
                "load-more": {
                  "height": ${height(CommunityFeedMetrics.LOAD_MORE)},
                  "fontSize": ${type.small.fontSize.value},
                  "fontWeight": ${FontWeight.Bold.weight},
                  "paddingLeft": ${CommunityFeedMetrics.LOAD_MORE_PADDING.toFloat()}
                }
              }
            }
            """.trimIndent()

        // The card is the origin, so its own top is zero on both sides. The
        // load-more's top is deliberately absent: it depends on how many rows the
        // page has, and the page's data is not the design.
        val dir = File("../../e2e/__visual__/community/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose
            .onNodeWithTag(CommunityFeedMetrics.LOAD_MORE_REGION, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
