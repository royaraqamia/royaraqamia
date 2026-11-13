package com.royaraqamia.app.accountnews

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
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponse
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponseRowsItem
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponseRowsItemKind
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponseRowsItemState
import com.royaraqamia.app.contracts.generated.NewsSourcesResponse
import com.royaraqamia.app.contracts.generated.NewsSourcesResponseSourcesItem
import com.royaraqamia.app.contracts.generated.NewsSourcesResponseSourcesItemCategory
import com.royaraqamia.app.contracts.generated.NewsSourcesResponseSourcesItemRegion
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
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/account/news` (#1347, ADR-0118).
 *
 * It draws the page's two cards at the viewport the page was recorded at - 393
 * CSS px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/account-news/<state>/app.json` and the one private list's own
 * pixels to `app.png`. `check:visual` compares them with the page's recording.
 *
 * The catalogue is the real one (`data/news/sources.json`), because the page
 * draws every approved source and the gap between the two cards is the height of
 * them all. The private feed is the page's fixture (`VISUAL_NEWS_SOURCE` in
 * `e2e/visual-fixture.ts`): one ready row with the same name and URL, so the
 * raster is the two clients drawing the same list (ADR-0119). The plan is the
 * fixture account's - Pro, ten private feeds - so the badge reads the same
 * `1 / 10` on both sides.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class NewsScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val catalogue: List<NewsSource> by lazy {
        val json = JSONObject(File("../../data/news/sources.json").readText())
        val sources = json.getJSONArray("sources")
        (0 until sources.length()).map { index ->
            val source = sources.getJSONObject(index)
            NewsSource(
                id = source.getString("id"),
                name = source.getString("name"),
                category = source.getString("category"),
                region = source.getString("region"),
            )
        }
    }

    private val privateSource =
        NewsPrivateSourcesResponseRowsItem(
            id = "e2e00000-0000-4000-8000-00000000e136",
            kind = NewsPrivateSourcesResponseRowsItemKind.SOURCE,
            name = "مصدر البوابة",
            url = "https://example.com/e2e-visual-private.xml",
            resolvedUrl = null,
            state = NewsPrivateSourcesResponseRowsItemState.LIVE,
            failure = null,
            note = null,
            lastError = null,
            createdAt = "2026-11-13T00:00:00.000Z",
        )

    private fun repository(rows: List<NewsPrivateSourcesResponseRowsItem>): NewsRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }

        val sourcesBody =
            ContractCodec.encode(
                NewsSourcesResponse(
                    success = true,
                    sources =
                        catalogue.map { source ->
                            NewsSourcesResponseSourcesItem(
                                id = source.id,
                                name = source.name,
                                category = categoryOf(source.category),
                                region = regionOf(source.region),
                                tier = 1L,
                            )
                        },
                    // Empty means "everything", exactly as the page stores the
                    // fully-ticked default.
                    selected = emptyList(),
                )
            )
        val privateBody =
            ContractCodec.encode(
                NewsPrivateSourcesResponse(
                    success = true,
                    rows = rows,
                    limited = true,
                    cap = 10L,
                    used = rows.size.toLong(),
                )
            )

        return NewsRepository(
            ApiClient(
                "https://app.test",
                session,
                RecordingTransport { request ->
                    val body =
                        if (request.url.contains(NewsRepository.OWNED_SOURCES_PATH)) {
                            privateBody
                        } else {
                            sourcesBody
                        }
                    HttpResponse(200, body)
                },
            )
        )
    }

    private fun compose(rows: List<NewsPrivateSourcesResponseRowsItem>) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        NewsScreen(
                            repository = repository(rows),
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

    private fun record(state: String, elements: String) {
        val json = JSONObject("""{"surface":"account-news","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/account-news/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The list sits below the fold on the gate's 852px phone, and a capture
        // of a node outside the drawn window has no image. The page's own
        // recording scrolls its capture region in first; this is the app's half.
        compose.onNodeWithTag(AccountNewsMetrics.PRIVATE, useUnmergedTree = true).performScrollTo()
        compose
            .onNodeWithTag(AccountNewsMetrics.PRIVATE, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    private fun titleElement() =
        """
        "title": {
          "top": ${top(AccountNewsMetrics.TITLE)},
          "height": ${height(AccountNewsMetrics.TITLE)},
          "fontSize": ${AccountNewsMetrics.titleSize.value},
          "fontWeight": ${AccountNewsMetrics.titleWeight.weight}
        }
        """

    private fun sourceRowElement() =
        """
        "source-row": {
          "top": ${top(AccountNewsMetrics.SOURCE_ROW)},
          "width": ${width(AccountNewsMetrics.SOURCE_ROW)},
          "height": ${height(AccountNewsMetrics.SOURCE_ROW)},
          "radius": ${AccountNewsMetrics.rowRadius.value},
          "paddingLeft": ${AccountNewsMetrics.rowPaddingHorizontal.value}
        }
        """

    private fun privateElement() =
        """
        "private-sources": {
          "top": ${top(AccountNewsMetrics.PRIVATE)},
          "width": ${width(AccountNewsMetrics.PRIVATE)},
          "fontSize": 16
        }
        """

    private fun requestElement() =
        """
        "source-request": {
          "top": ${top(AccountNewsMetrics.REQUEST)},
          "width": ${width(AccountNewsMetrics.REQUEST)},
          "fontSize": 16
        }
        """

    @Test
    fun `the list with one feed records the same numbers as the page`() {
        compose(listOf(privateSource))
        waitFor(AccountNewsMetrics.PRIVATE)
        waitFor(AccountNewsMetrics.SOURCE_ROW)

        record(
            state = "at-rest",
            elements =
                """
                ${titleElement()},
                ${sourceRowElement()},
                ${privateElement()},
                ${requestElement()}
                """,
        )
    }

    @Test
    fun `the empty list records the page's own sentence`() {
        compose(emptyList())
        waitFor(AccountNewsMetrics.PRIVATE)
        waitFor(AccountNewsMetrics.PRIVATE_EMPTY)

        record(
            state = "empty",
            elements =
                """
                ${titleElement()},
                ${privateElement()},
                "private-empty": {
                  "top": ${top(AccountNewsMetrics.PRIVATE_EMPTY)},
                  "width": ${width(AccountNewsMetrics.PRIVATE_EMPTY)},
                  "height": ${height(AccountNewsMetrics.PRIVATE_EMPTY)},
                  "fontSize": ${AccountNewsMetrics.emptySize.value},
                  "paddingLeft": ${AccountNewsMetrics.emptyPadding.value}
                },
                ${requestElement()}
                """,
        )
    }

    private fun categoryOf(category: String): NewsSourcesResponseSourcesItemCategory =
        when (category) {
            "tech" -> NewsSourcesResponseSourcesItemCategory.TECH
            "politics" -> NewsSourcesResponseSourcesItemCategory.POLITICS
            "religion" -> NewsSourcesResponseSourcesItemCategory.RELIGION
            "economy" -> NewsSourcesResponseSourcesItemCategory.ECONOMY
            "world" -> NewsSourcesResponseSourcesItemCategory.WORLD
            else -> NewsSourcesResponseSourcesItemCategory.OTHER
        }

    private fun regionOf(region: String): NewsSourcesResponseSourcesItemRegion =
        when (region) {
            "arab" -> NewsSourcesResponseSourcesItemRegion.ARAB
            "islamic" -> NewsSourcesResponseSourcesItemRegion.ISLAMIC
            else -> NewsSourcesResponseSourcesItemRegion.WORLD
        }
}
