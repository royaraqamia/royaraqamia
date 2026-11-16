package com.royaraqamia.app.admin

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.account.AccountProfileRepository
import com.royaraqamia.app.account.AvatarLoader
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The console's door (#974, ADR-0193): the server's `isAdmin` decides whether the
 * section index is drawn, and a section opens the page's own route.
 *
 * The read is the only admin call the app makes; the rows are the page's, and the
 * server authorizes every destination again. Turning a non-admin away before the
 * list is composed is convenience on top of that, not the authorization.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AdminScreenTest {
    @get:Rule val compose = createComposeRule()

    private fun profileRepository(isAdmin: Boolean): AccountProfileRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return AccountProfileRepository(
            client =
                ApiClient(
                    "https://app.test",
                    session,
                    RecordingTransport {
                        HttpResponse(
                            200,
                            """{"isAdmin":$isAdmin,"name":"أحمد","email":"a@b.test","avatarUrl":null,"username":"ahmad"}""",
                        )
                    },
                ),
            avatars = AvatarLoader { null },
        )
    }

    private fun draw(
        isAdmin: Boolean,
        onDenied: () -> Unit = {},
        onOpenRoute: (String) -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AdminConsoleRoute(
                            profileRepository = profileRepository(isAdmin),
                            onDenied = onDenied,
                            onOpenRoute = onOpenRoute,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `an allowlisted account sees the console's sections`() {
        draw(isAdmin = true)

        compose.waitUntil(10_000) {
            compose.onAllNodesWithTag(AdminConsoleTags.section("reports")).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag(AdminConsoleTags.TITLE).assertExists()
        compose.onNodeWithTag(AdminConsoleTags.section("certificates")).assertExists()
    }

    @Test
    fun `a non-allowlisted token is turned away before any row is drawn`() {
        var denied = false
        draw(isAdmin = false, onDenied = { denied = true })

        compose.waitUntil(10_000) { denied }
        compose.onNodeWithTag(AdminConsoleTags.LIST).assertDoesNotExist()
        assertTrue("the server's answer closed the door", denied)
    }

    @Test
    fun `a section opens the page's own route`() {
        var opened: String? = null
        draw(isAdmin = true, onOpenRoute = { opened = it })

        compose.waitUntil(10_000) {
            compose.onAllNodesWithTag(AdminConsoleTags.section("reports")).fetchSemanticsNodes().isNotEmpty()
        }
        compose
            .onNodeWithTag(AdminConsoleTags.section("reports"))
            .performScrollTo()
            .performClick()

        assertEquals("/admin/reports", opened)
    }
}
