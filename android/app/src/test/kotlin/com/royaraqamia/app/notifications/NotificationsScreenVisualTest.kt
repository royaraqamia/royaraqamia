package com.royaraqamia.app.notifications

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
import com.royaraqamia.app.contracts.generated.NotificationsResponse
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemMetadata
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemType
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
import java.io.File
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/notifications` (#1391, ADR-0118).
 *
 * It draws the page's Alerts feed at the viewport the page was recorded at - 393
 * CSS px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/notifications/<state>/app.json` and the list's own pixels to
 * `app.png`. `check:visual` compares them with the page's recording.
 *
 * The rows are the page's fixture (`VISUAL_NOTIFICATIONS` in
 * `e2e/visual-fixture.ts`): one unread with a body and the certificate
 * destination, one read without a body. Their instants are offsets from the
 * test's own clock, so the relative sentence is the same every run - "two hours"
 * and "three days" - and the clock is not in the recording (ADR-0119).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class NotificationsScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val unread: NotificationsResponseNotificationsItem by lazy {
        val now = Instant.now()
        NotificationsResponseNotificationsItem(
            id = "e2e00000-0000-4000-8000-00000000e141",
            user_id = "user-1",
            type = NotificationsResponseNotificationsItemType.CERTIFICATE_ISSUED,
            title = "شهادة تجريبية للبوابة",
            body = "هذه شهادة تجريبية تقيس صفَّ الإشعارات على الشاشتين، وتقارن المسافات والحجم واللون بين التطبيق والموقع في الحالة نفسها.",
            metadata =
                NotificationsResponseNotificationsItemMetadata(certificateCode = "e2e-visual"),
            is_read = false,
            created_at = now.minus(Duration.ofHours(2)).toString(),
            read_at = null,
        )
    }

    private val read: NotificationsResponseNotificationsItem by lazy {
        val then = Instant.now().minus(Duration.ofDays(3))
        NotificationsResponseNotificationsItem(
            id = "e2e00000-0000-4000-8000-00000000e142",
            user_id = "user-1",
            type = NotificationsResponseNotificationsItemType.LINK_CLICKED,
            title = "رابط تجريبي للبوابة",
            body = null,
            metadata = NotificationsResponseNotificationsItemMetadata(),
            is_read = true,
            created_at = then.toString(),
            read_at = then.toString(),
        )
    }

    private fun repository(rows: List<NotificationsResponseNotificationsItem>): NotificationsRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }

        val body = ContractCodec.encode(NotificationsResponse(notifications = rows))

        return NotificationsRepository(
            ApiClient(
                "https://app.test",
                session,
                RecordingTransport { HttpResponse(200, body) },
            )
        )
    }

    private fun compose(rows: List<NotificationsResponseNotificationsItem>) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        NotificationsScreen(
                            repository = repository(rows),
                            signedIn = true,
                            onSignIn = {},
                            onOpenRoute = {},
                            onChanged = {},
                        )
                    }
                }
            }
        }
    }

    /** The first node with the tag, which is the row the page records first. */
    private fun bounds(tag: String) =
        compose.onAllNodesWithTag(tag, useUnmergedTree = true)[0].getUnclippedBoundsInRoot()

    private fun top(tag: String) = bounds(tag).top.value
    private fun width(tag: String) = (bounds(tag).right - bounds(tag).left).value
    private fun height(tag: String) = (bounds(tag).bottom - bounds(tag).top).value

    private fun waitFor(tag: String) {
        compose.waitUntil(10_000) {
            compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun record(state: String, elements: String, capture: String) {
        val json = JSONObject("""{"surface":"notifications","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/notifications/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(capture, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    private fun recordAtRest() {
        record(
            state = "at-rest",
            capture = NotificationsMetrics.LIST,
            elements =
                """
                "notifications-list": {
                  "top": ${top(NotificationsMetrics.LIST)},
                  "width": ${width(NotificationsMetrics.LIST)},
                  "radius": ${NotificationsMetrics.listRadius.value},
                  "borderTopWidth": ${NotificationsMetrics.listBorder.value}
                },
                "notification-row": {
                  "top": ${top(NotificationsMetrics.ROW)},
                  "width": ${width(NotificationsMetrics.ROW)},
                  "height": ${height(NotificationsMetrics.ROW)}
                },
                "notification-icon": {
                  "top": ${top(NotificationsMetrics.ICON)},
                  "width": ${width(NotificationsMetrics.ICON)},
                  "height": ${height(NotificationsMetrics.ICON)},
                  "radius": ${NotificationsMetrics.iconRadius.value}
                },
                "notification-title": {
                  "top": ${top(NotificationsMetrics.TITLE)},
                  "height": ${height(NotificationsMetrics.TITLE)},
                  "fontSize": ${NotificationsMetrics.titleSize.value},
                  "fontWeight": ${NotificationsMetrics.titleWeightUnread.weight}
                },
                "notification-body": {
                  "top": ${top(NotificationsMetrics.BODY)},
                  "height": ${height(NotificationsMetrics.BODY)},
                  "fontSize": ${NotificationsMetrics.bodySize.value}
                },
                "notification-time": {
                  "top": ${top(NotificationsMetrics.TIME)},
                  "height": ${height(NotificationsMetrics.TIME)},
                  "fontSize": ${NotificationsMetrics.timeSize.value}
                },
                "notification-unread": {
                  "width": ${width(NotificationsMetrics.UNREAD)},
                  "height": ${height(NotificationsMetrics.UNREAD)}
                },
                "notification-delete": {
                  "top": ${top(NotificationsMetrics.DELETE)},
                  "width": ${width(NotificationsMetrics.DELETE)},
                  "height": ${height(NotificationsMetrics.DELETE)}
                }
                """,
        )
    }

    @Test
    fun `the feed records the same numbers as the page`() {
        compose(listOf(unread, read))
        waitFor(NotificationsMetrics.LIST)
        waitFor(NotificationsMetrics.ROW)
        recordAtRest()
    }

    @Test
    fun `the empty feed records the page's own frame`() {
        compose(emptyList())
        waitFor(NotificationsMetrics.EMPTY)

        record(
            state = "empty",
            capture = NotificationsMetrics.EMPTY,
            elements =
                """
                "notifications-empty": {
                  "top": ${top(NotificationsMetrics.EMPTY)},
                  "width": ${width(NotificationsMetrics.EMPTY)},
                  "height": ${height(NotificationsMetrics.EMPTY)},
                  "radius": ${NotificationsMetrics.panelRadius.value}
                }
                """,
        )
    }
}
