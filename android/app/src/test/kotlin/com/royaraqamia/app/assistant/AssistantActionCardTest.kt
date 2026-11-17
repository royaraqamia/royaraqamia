package com.royaraqamia.app.assistant

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.LayoutDirection
import com.royaraqamia.app.contracts.generated.ChatAgentAction
import com.royaraqamia.app.contracts.generated.ChatAgentActionArgs
import com.royaraqamia.app.contracts.generated.ChatAgentActionStatus
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** The proposal card's two answers, drawn and tapped (#1182). */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AssistantActionCardTest {
    @get:Rule val compose = createComposeRule()

    private val proposal =
        ChatAgentAction(
            id = "a-1",
            conversationId = "c-1",
            messageId = "m-1",
            tool = "create_habit",
            args = ChatAgentActionArgs(),
            status = ChatAgentActionStatus.PROPOSED,
            result = null,
            createdAt = "2026-11-17T10:00:00.000Z",
            resolvedAt = null,
            resolvedBy = null,
        )

    @Test
    fun `the card answers confirm or reject`() {
        var answered: String? = null
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    AssistantActionCard(
                        action = proposal,
                        sentence = "إنشاء عادة — القراءة",
                        onAnswer = { answered = it },
                    )
                }
            }
        }

        compose.onNodeWithText("إنشاء عادة — القراءة").assertExists()
        compose.onNodeWithText(AssistantPanelCopy.ACTION_CONFIRM).performClick()
        compose.waitForIdle()
        assertEquals("confirm", answered)

        answered = null
        compose.onNodeWithText(AssistantPanelCopy.ACTION_REJECT).performClick()
        compose.waitForIdle()
        assertEquals("reject", answered)
    }
}
