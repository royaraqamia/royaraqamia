package com.royaraqamia.app.account

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
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
 * The profile card's two writes (#946): the name dialog posts the page's PATCH,
 * and the avatar's removal asks first and then sends the page's DELETE.
 *
 * The reads are not the subject here - `AccountProfileRepositoryTest` holds the
 * routes - so the transport answers only the write being pressed, and the card is
 * drawn from a profile the test already knows.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AccountProfileCardTest {
    @get:Rule val compose = createComposeRule()

    private fun repository(transport: RecordingTransport): AccountProfileRepository {
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
            client = ApiClient("https://app.test", session, transport),
            avatars = AvatarLoader { null },
        )
    }

    private fun draw(
        profile: AccountProfile,
        repository: AccountProfileRepository,
        onChanged: (AccountProfile) -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AccountProfileCard(
                            profile = profile,
                            repository = repository,
                            onChanged = onChanged,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `the name edit writes the page's PATCH and paints the kept name`() {
        val transport =
            RecordingTransport { HttpResponse(200, """{"success":true,"name":"سارة"}""") }
        val changes = mutableListOf<AccountProfile>()
        draw(
            profile = AccountProfile(name = "أحمد", email = "a@b.test", avatarUrl = null),
            repository = repository(transport),
            onChanged = { changes += it },
        )

        compose.onNodeWithTag(AccountProfileMetrics.EDIT_NAME).performClick()
        compose.onNodeWithTag(AccountProfileMetrics.NAME_FIELD).performTextReplacement("سارة")
        compose.onNodeWithTag(AccountProfileMetrics.SAVE_NAME).performClick()
        compose.waitUntil(5_000) { changes.isNotEmpty() }

        val request = transport.requests.single()
        assertEquals("PATCH", request.method)
        assertEquals("https://app.test/api/me/name", request.url)
        assertEquals("""{"name":"سارة"}""", request.body)

        compose.onNodeWithText("سارة").assertExists()
        assertEquals("سارة", changes.last().name)
    }

    @Test
    fun `a blank name is refused before a request is spent`() {
        val transport = RecordingTransport { HttpResponse(500, "{}") }
        draw(
            profile = AccountProfile(name = "أحمد", email = "a@b.test", avatarUrl = null),
            repository = repository(transport),
        )

        compose.onNodeWithTag(AccountProfileMetrics.EDIT_NAME).performClick()
        compose.onNodeWithTag(AccountProfileMetrics.NAME_FIELD).performTextReplacement("   ")
        compose.onNodeWithTag(AccountProfileMetrics.SAVE_NAME).performClick()

        assertTrue("no request for an invalid name", transport.requests.isEmpty())
        compose.onNodeWithText(AccountProfileCopy.NAME_REQUIRED).assertExists()
    }

    @Test
    fun `removing the avatar asks first and then writes the page's DELETE`() {
        val transport =
            RecordingTransport { HttpResponse(200, """{"success":true,"avatarUrl":null}""") }
        val changes = mutableListOf<AccountProfile>()
        draw(
            profile =
                AccountProfile(
                    name = "أحمد",
                    email = "a@b.test",
                    avatarUrl = "https://cdn.test/a.png",
                ),
            repository = repository(transport),
            onChanged = { changes += it },
        )

        compose.onNodeWithTag(AccountProfileMetrics.AVATAR).performClick()
        compose.onNodeWithTag(AccountProfileMetrics.REMOVE_AVATAR).performClick()
        compose.onNodeWithTag(AccountProfileMetrics.CONFIRM_REMOVE).performClick()
        compose.waitUntil(5_000) { changes.isNotEmpty() }

        val request = transport.requests.single()
        assertEquals("DELETE", request.method)
        assertEquals("https://app.test/api/me/avatar", request.url)
        assertEquals(null, changes.last().avatarUrl)
    }
}
