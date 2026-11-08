package com.royaraqamia.app.chats

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.assertTextContains
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
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The new-conversation screen's rules the repository cannot show (#934): the
 * direct pick hands the page a handle rather than writing, the group form's
 * boundaries are the page's zero, one and thirty-two, and a created group
 * opens the thread it just made rather than the list.
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
        createGroup: suspend (String, List<String>) -> ApiResult<String> = { _, _ ->
            ApiResult.Success("g-1")
        },
        onOpenPeer: (String) -> Unit = {},
        onOpenThread: (String) -> Unit = {},
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        ChatNewScreen(
                            searchMembers = { ApiResult.Success(members) },
                            createGroup = createGroup,
                            onOpenPeer = onOpenPeer,
                            onOpenThread = onOpenThread,
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

    @Test
    fun `a group with no name or members is refused before any write`() {
        var writes = 0
        draw(
            createGroup = { _, _ ->
                writes += 1
                ApiResult.Success("g-1")
            }
        )

        compose.onNodeWithTag(ChatNewTags.GROUP_TAB).performClick()
        compose.onNodeWithTag(ChatNewTags.CREATE).performClick()
        compose.onNodeWithTag(ChatNewTags.ERROR).assertTextContains(ChatNewCopy.GROUP_NAME_REQUIRED)

        compose.onNodeWithTag(ChatNewTags.GROUP_TITLE).performTextInput("فريق التصميم")
        compose.onNodeWithTag(ChatNewTags.CREATE).performClick()
        compose
            .onNodeWithTag(ChatNewTags.ERROR)
            .assertTextContains(ChatNewCopy.GROUP_MEMBERS_REQUIRED)

        assertEquals("nothing was sent", 0, writes)
    }

    @Test
    fun `one member creates the group and opens the thread it just made`() {
        var opened: String? = null
        var sentTitle: String? = null
        var sentMembers: List<String>? = null
        draw(
            createGroup = { title, ids ->
                sentTitle = title
                sentMembers = ids
                ApiResult.Success("g-1")
            },
            onOpenThread = { opened = it },
        )

        compose.onNodeWithTag(ChatNewTags.GROUP_TAB).performClick()
        compose.onNodeWithTag(ChatNewTags.GROUP_TITLE).performTextInput("فريق التصميم")
        compose.onNodeWithTag(ChatNewTags.SEARCH).performTextInput("al")
        compose.waitForIdle()
        compose.onNodeWithTag(ChatNewTags.LIMIT).assertTextContains("31", substring = true)
        compose.onNodeWithTag(ChatNewTags.result("p-1")).performClick()
        compose.onNodeWithTag(ChatNewTags.CREATE).performClick()
        compose.waitForIdle()

        assertEquals("فريق التصميم", sentTitle)
        assertEquals(listOf("p-1"), sentMembers)
        assertEquals("the thread it just created, not the list", "g-1", opened)
    }

    @Test
    fun `the member boundaries are the page's zero, one and thirty-two`() {
        assertEquals(ChatNewCopy.GROUP_MEMBERS_REQUIRED, groupMembersError(0))
        assertNull(groupMembersError(1))
        assertNull(groupMembersError(31))
        assertEquals(ChatNewCopy.TOO_MANY_MEMBERS, groupMembersError(32))
    }
}
