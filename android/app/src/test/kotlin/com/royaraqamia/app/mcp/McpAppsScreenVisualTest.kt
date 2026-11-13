package com.royaraqamia.app.mcp

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.isSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.shell.AppsSheetMetrics
import com.royaraqamia.app.shell.AppsSheetTab
import com.royaraqamia.app.shell.PickerMetrics
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.theme.royTypeScale
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/mcp/apps` (#1256, ADR-0118).
 *
 * It draws the page host - the title, the three chips, the field and the panel -
 * at the viewport the page was recorded at (393 x 852 CSS px, Arabic, RTL, dark),
 * writes every contract element's numbers beside the page's recording, and
 * captures the region both clients draw identically.
 *
 * The three states are the surface's own: our list, the store with the fixture's
 * one verified row, and the connected list with none. Each is composed without a
 * network, a session or a clock: the repositories answer from a fixed transport,
 * and the store's row is the same one `e2e/visual-fixture.ts` seeds for the
 * capture.
 *
 * The numbers the boxes cannot carry - type sizes, weights, radii - are read from
 * the objects the screen draws with ([AppsSheetMetrics], [royTypeScale], the
 * page metrics), so a changed token changes the recording.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class McpAppsScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val type = royTypeScale(393f)

    private fun session(): Session =
        runBlocking {
            Session(
                    MemoryTokenStore("refresh-1"),
                    TokenRefresher { RefreshOutcome.Refused },
                    MemoryIdentityStorage(),
                )
                .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    private fun store(
        servers: String = "[]",
        connections: String = "[]",
        queryAnswer: (String) -> String = { servers },
    ): McpStoreRepository =
        McpStoreRepository(
            client =
                ApiClient(
                    "https://app.test",
                    session(),
                    RecordingTransport { request ->
                        when {
                            request.url.endsWith("/api/me/mcp/connections") ->
                                HttpResponse(200, """{"success":true,"data":$connections}""")
                            else ->
                                HttpResponse(
                                    200,
                                    """{"success":true,"data":{"servers":${queryAnswer(request.url)},"nextCursor":null}}""",
                                )
                        }
                    },
                ),
            siteUrl = "https://app.test",
            identityKey = { "user-1" },
        )

    private fun connected(): ConnectedAppsRepository =
        ConnectedAppsRepository(
            ApiClient(
                "https://app.test",
                session(),
                RecordingTransport { _ ->
                    HttpResponse(200, """{"success":true,"data":[]}""")
                },
            ),
            identityKey = { "user-1" },
        )

    private fun screen(tab: AppsSheetTab, marketplace: McpStoreRepository, order: List<String>) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        McpAppsScreen(
                            tab = tab,
                            order = order,
                            busy = null,
                            error = null,
                            onToggle = {},
                            marketplace = marketplace,
                            signedIn = true,
                            onSignIn = {},
                            onOpenConnection = {},
                            onOpenExternal = {},
                            brandMark = null,
                            connectedApps = connected(),
                            onConnectNew = {},
                            onTabChange = {},
                        )
                    }
                }
            }
        }
    }

    private fun bounds(tag: String, index: Int = 0) =
        compose.onAllNodesWithTag(tag, useUnmergedTree = true)[index].getUnclippedBoundsInRoot()

    private fun top(tag: String, index: Int = 0) = bounds(tag, index).top.value
    private fun width(tag: String, index: Int = 0) =
        (bounds(tag, index).right - bounds(tag, index).left).value
    private fun height(tag: String, index: Int = 0) =
        (bounds(tag, index).bottom - bounds(tag, index).top).value

    private fun capture(tag: String, state: String) {
        val dir = File("../../e2e/__visual__/mcp-apps/$state").apply { mkdirs() }
        compose.onNodeWithTag(tag, useUnmergedTree = true).captureRoboImage(File(dir, "app.png").path)
    }

    private fun write(state: String, json: String) {
        val dir = File("../../e2e/__visual__/mcp-apps/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
    }

    @Test
    fun `internal is our own list`() {
        screen(AppsSheetTab.Internal, store(), order = listOf("/quran", "/rates"))

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag("services-row", useUnmergedTree = true).fetchSemanticsNodes().size > 1
        }

        val tab = compose.onNode(hasTestTag("apps-tab") and isSelected(), useUnmergedTree = true)
        val tabBox = tab.getUnclippedBoundsInRoot()
        val tabHeight = (tabBox.bottom - tabBox.top).value

        val json =
            """
            {
              "surface": "mcp-apps",
              "state": "internal",
              "elements": {
                "surface": {
                  "top": ${top("apps-surface")},
                  "width": ${width("apps-surface")},
                  "height": ${height("apps-surface")}
                },
                "title": {
                  "top": ${top("apps-page-title")},
                  "height": ${height("apps-page-title")},
                  "fontSize": ${AppsPageMetrics.titleSize.value},
                  "fontWeight": ${AppsPageMetrics.titleWeight.weight},
                  "lineHeight": ${AppsPageMetrics.titleLineHeight.value}
                },
                "tabs": {
                  "top": ${top("apps-tabs")},
                  "height": ${height("apps-tabs")}
                },
                "tab": {
                  "height": $tabHeight,
                  "radius": 33554400,
                  "fontSize": ${AppsSheetMetrics.tabTextSize.value},
                  "fontWeight": 700,
                  "paddingLeft": ${AppsSheetMetrics.tabHorizontalPadding.value}
                },
                "search": {
                  "top": ${top("apps-search")},
                  "height": ${height("apps-search")},
                  "radius": ${AppsSheetMetrics.searchRadius.value},
                  "fontSize": ${AppsSheetMetrics.searchTextSize.value},
                  "paddingLeft": ${AppsSheetMetrics.searchEndInset.value}
                },
                "row": {
                  "top": ${top("services-row")},
                  "height": ${height("services-row")}
                },
                "row-action": {
                  "width": ${width("services-row-action")},
                  "height": ${height("services-row-action")},
                  "radius": 33554400,
                  "fontSize": ${PickerMetrics.rowActionTextSize.value}
                }
              }
            }
            """.trimIndent()

        write("internal", json)
        capture("apps-surface", "internal")
    }

    @Test
    fun `the store draws the fixture's verified row`() {
        val row =
            """
            [{
              "registryName": "e2e-visualgate.example/mcp",
              "title": "Visualgate",
              "description": "A fixed row the visual gate seeds for one recording.",
              "nameAr": null,
              "iconUrl": null,
              "verified": true,
              "featuredRank": 1,
              "connectable": true,
              "connectableReason": null,
              "authMode": "oauth",
              "probeAuthMode": "oauth",
              "publishedAt": "2026-11-01T00:00:00.000Z",
              "requestedScopes": []
            }]
            """.trimIndent()

        screen(
            AppsSheetTab.External,
            store(servers = row, queryAnswer = { if (it.contains("q=e2e-visualgate")) row else "[]" }),
            order = emptyList(),
        )

        compose
            .onNodeWithTag("apps-search-input", useUnmergedTree = true)
            .performTextInput("e2e-visualgate")
        compose.waitUntil(timeoutMillis = 10_000) {
            compose.onAllNodesWithTag("marketplace-server", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        val json =
            """
            {
              "surface": "mcp-apps",
              "state": "store",
              "elements": {
                "title": {
                  "height": ${height("apps-page-title")},
                  "fontSize": ${AppsPageMetrics.titleSize.value},
                  "fontWeight": ${AppsPageMetrics.titleWeight.weight},
                  "lineHeight": ${AppsPageMetrics.titleLineHeight.value}
                },
                "tabs": {
                  "top": ${top("apps-tabs")},
                  "height": ${height("apps-tabs")}
                },
                "connections-title": {
                  "top": ${top("marketplace-connections-title")},
                  "height": ${height("marketplace-connections-title")},
                  "fontSize": 16,
                  "fontWeight": 800
                },
                "row": {
                  "top": ${top("marketplace-server")},
                  "width": ${width("marketplace-server")},
                  "height": ${height("marketplace-server")},
                  "radius": 16,
                  "paddingTop": 14,
                  "paddingLeft": 16
                },
                "mark": {
                  "width": ${width("marketplace-mark")},
                  "height": ${height("marketplace-mark")},
                  "radius": ${MarketplaceMetrics.markRadius.value}
                },
                "verified": {
                  "width": ${width("marketplace-verified")},
                  "height": ${height("marketplace-verified")}
                },
                "connect": {
                  "width": ${width("marketplace-connect")},
                  "height": ${height("marketplace-connect")},
                  "radius": 12,
                  "fontSize": ${type.xs.fontSize.value}
                }
              }
            }
            """.trimIndent()

        write("store", json)
        capture("marketplace-server", "store")
    }

    @Test
    fun `inbound with no clients draws the empty card`() {
        screen(AppsSheetTab.Inbound, store(), order = emptyList())

        compose.waitUntil(timeoutMillis = 5_000) {
            compose.onAllNodesWithTag("connected-empty", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        val json =
            """
            {
              "surface": "mcp-apps",
              "state": "inbound",
              "elements": {
                "title": {
                  "height": ${height("apps-page-title")},
                  "fontSize": ${AppsPageMetrics.titleSize.value},
                  "fontWeight": ${AppsPageMetrics.titleWeight.weight},
                  "lineHeight": ${AppsPageMetrics.titleLineHeight.value}
                },
                "tabs": {
                  "top": ${top("apps-tabs")},
                  "height": ${height("apps-tabs")}
                },
                "search": {
                  "top": ${top("apps-search")},
                  "height": ${height("apps-search")},
                  "radius": ${AppsSheetMetrics.searchRadius.value},
                  "fontSize": ${AppsSheetMetrics.searchTextSize.value}
                },
                "empty": {
                  "top": ${top("connected-empty")},
                  "width": ${width("connected-empty")},
                  "height": ${height("connected-empty")},
                  "radius": 16,
                  "paddingTop": 24,
                  "paddingLeft": 24
                }
              }
            }
            """.trimIndent()

        write("inbound", json)
        capture("connected-empty", "inbound")
    }
}
