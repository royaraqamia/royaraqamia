package com.royaraqamia.app.account

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
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ChatBlockedMembersResponse
import com.royaraqamia.app.contracts.generated.ChatBlockedMembersResponseBlockedItem
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.theme.royTypeScale
import java.io.File
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/account/blocked` (#1346, ADR-0118).
 *
 * It draws the screen at the width the page was recorded at - 393 CSS px, Arabic,
 * RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/account-blocked/<state>/app.json` and the contract's capture
 * region to `app.png`, and `check:visual` compares them with the page's
 * recording.
 *
 * The two members are the fixture the page's recording seeds
 * (`VISUAL_BLOCKED_MEMBERS` in `e2e/visual-fixture.ts`), in the same order, so
 * the first row is the same member on both sides and the raster is the two
 * clients drawing one row rather than two different ones (ADR-0119). The second
 * state is the page's own sentence for an account that has blocked nobody.
 *
 * The boxes are measured; the type sizes, weights and radii the contract names
 * are read from [BlockedMembersMetrics], the object the screen draws with,
 * because Compose does not expose resolved typography through the semantics
 * tree.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class BlockedMembersScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val blocked =
        listOf(
            BlockedMember(
                id = "e2e00000-0000-4000-8000-00000000b001",
                username = "sara-e2e",
                name = "سارة",
                avatarUrl = null,
            ),
            BlockedMember(
                id = "e2e00000-0000-4000-8000-00000000b002",
                username = "omar-e2e",
                name = "عمر",
                avatarUrl = null,
            ),
        )

    private fun repository(members: List<BlockedMember>): BlockedMembersRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        val body =
            ContractCodec.encode(
                ChatBlockedMembersResponse(
                    success = true,
                    blocked =
                        members.map { member ->
                            ChatBlockedMembersResponseBlockedItem(
                                id = member.id,
                                username = member.username,
                                name = member.name,
                                avatarUrl = member.avatarUrl,
                                verified = true,
                            )
                        },
                )
            )
        return BlockedMembersRepository(
            ApiClient("https://app.test", session, RecordingTransport { HttpResponse(200, body) })
        )
    }

    private fun compose(members: List<BlockedMember>) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        BlockedMembersScreen(
                            repository = repository(members),
                            signedIn = true,
                            onSignIn = {},
                        )
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

    private fun waitFor(tag: String) {
        compose.waitUntil(10_000) {
            compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun record(state: String, captureTag: String, elements: String) {
        val json = JSONObject("""{"surface":"account-blocked","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/account-blocked/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(captureTag, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    private fun titleElement() =
        """
        "title": {
          "top": ${top(BlockedMembersMetrics.TITLE)},
          "height": ${height(BlockedMembersMetrics.TITLE)},
          "fontSize": ${BlockedMembersMetrics.titleSize.value},
          "fontWeight": ${BlockedMembersMetrics.titleWeight.weight}
        }
        """

    @Test
    fun `the populated list records the same numbers as the page`() {
        compose(blocked)
        waitFor(BlockedMembersMetrics.rowTag(0))

        val type = royTypeScale(393f)

        record(
            state = "at-rest",
            captureTag = BlockedMembersMetrics.rowTag(0),
            elements =
                """
                ${titleElement()},
                "list": {
                  "top": ${top(BlockedMembersMetrics.LIST)},
                  "width": ${width(BlockedMembersMetrics.LIST)},
                  "radius": ${BlockedMembersMetrics.cardRadius.value}
                },
                "first-row": {
                  "top": ${top(BlockedMembersMetrics.rowTag(0))},
                  "width": ${width(BlockedMembersMetrics.rowTag(0))},
                  "height": ${height(BlockedMembersMetrics.rowTag(0))}
                },
                "first-name": {
                  "height": ${height(BlockedMembersMetrics.nameTag(0))},
                  "fontSize": ${type.small.fontSize.value},
                  "fontWeight": 700
                },
                "first-handle": {
                  "height": ${height(BlockedMembersMetrics.handleTag(0))},
                  "fontSize": ${type.xs.fontSize.value}
                },
                "first-unblock": {
                  "width": ${width(BlockedMembersMetrics.unblockTag(0))},
                  "height": ${height(BlockedMembersMetrics.unblockTag(0))},
                  "radius": ${BlockedMembersMetrics.unblockRadius},
                  "fontSize": ${type.xs.fontSize.value},
                  "fontWeight": 700
                }
                """,
        )
    }

    @Test
    fun `the empty list records the page's own sentence`() {
        compose(emptyList())
        waitFor(BlockedMembersMetrics.EMPTY)

        val type = royTypeScale(393f)

        record(
            state = "empty",
            captureTag = BlockedMembersMetrics.EMPTY,
            elements =
                """
                ${titleElement()},
                "empty": {
                  "top": ${top(BlockedMembersMetrics.EMPTY)},
                  "width": ${width(BlockedMembersMetrics.EMPTY)},
                  "height": ${height(BlockedMembersMetrics.EMPTY)},
                  "radius": ${BlockedMembersMetrics.cardRadius.value},
                  "fontSize": ${type.xs.fontSize.value}
                }
                """,
        )
    }
}
