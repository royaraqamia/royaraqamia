package com.royaraqamia.app.chats

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The new-conversation screen's rule the repository cannot show (#934): the
 * direct pick hands the page a handle rather than writing.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class ChatNewScreenTest {
    @get:Rule val compose = createComposeRule()

    private val alber =
        ChatMembersResponseMembersItem(
            id = "p-1",
            username = "alber",
            name = "Alber",
            avatarUrl = null,
            verified = true,
        )

    private fun draw(
        members: List<ChatMembersResponseMembersItem> = listOf(alber),
        onOpenPeer: (String) -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        ChatNewScreen(
                            searchMembers = { ApiResult.Success(members) },
                            onOpenPeer = onOpenPeer,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `picking a member opens the site's preview for that handle`() {
        var opened: String? = null
        draw(onOpenPeer = { opened = it })

        compose.onNodeWithTag(ChatNewTags.SEARCH).performTextInput("al")
        compose.waitForIdle()
        compose.onNodeWithTag(ChatNewTags.result("p-1")).performClick()

        assertEquals("the picker hands the page the handle, it does not write", "alber", opened)
    }
}
