package com.royaraqamia.app.assistant

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ChatAgentActionResponse
import com.royaraqamia.app.contracts.generated.ChatAgentActionStatus
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The proposal row the app reads and resolves (#1182).
 *
 * A card is only as true as the body it was drawn from, so these cases feed the
 * generated types the route's own JSON: the page's rows under a message, and the
 * settled row an answer hands back. Neither client words the row for itself.
 */
class AssistantActionTest {
    private val page =
        """
        {
          "success": true,
          "messages": [
            {
              "id": "m-1",
              "conversationId": "c-1",
              "senderId": null,
              "senderKind": "agent",
              "body": "إنشاء عادة — القراءة",
              "replyToId": null,
              "editedAt": null,
              "deletedAt": null,
              "createdAt": "2026-11-17T10:00:00.000Z",
              "attachments": []
            }
          ],
          "nextCursor": null,
          "actions": [
            {
              "id": "a-1",
              "conversationId": "c-1",
              "messageId": "m-1",
              "tool": "create_habit",
              "args": {"name": "القراءة"},
              "appName": null,
              "status": "proposed",
              "result": null,
              "createdAt": "2026-11-17T10:00:00.000Z",
              "resolvedAt": null,
              "resolvedBy": null
            }
          ]
        }
        """
            .trimIndent()

    @Test
    fun `a page carries the proposal under its message`() {
        val decoded = ContractCodec.decode<ChatMessagePageResponse>(page)
        assertTrue(decoded is ApiResult.Success)
        val body = (decoded as ApiResult.Success).value

        val action = body.actions!!.single().asAssistantAction()
        assertEquals("a-1", action.id)
        assertEquals("m-1", action.messageId)
        assertEquals("create_habit", action.tool)
        assertEquals(ChatAgentActionStatus.PROPOSED, action.status)
        assertEquals(null, action.result)
        assertEquals("إنشاء عادة — القراءة", body.messages!!.single().body)
    }

    @Test
    fun `an answer replaces the row with the settled one`() {
        val answer =
            """
            {
              "success": true,
              "action": {
                "id": "a-1",
                "conversationId": "c-1",
                "messageId": "m-1",
                "tool": "create_habit",
                "args": {},
                "appName": null,
                "status": "failed",
                "result": {"error": "بلغت حدّ خطتك"},
                "createdAt": "2026-11-17T10:00:00.000Z",
                "resolvedAt": "2026-11-17T10:01:00.000Z",
                "resolvedBy": "u-1"
              }
            }
            """
                .trimIndent()

        val decoded = ContractCodec.decode<ChatAgentActionResponse>(answer)
        assertTrue(decoded is ApiResult.Success)
        val settled = (decoded as ApiResult.Success).value.action!!.toAssistantAction()

        assertEquals("a-1", settled.id)
        assertEquals(ChatAgentActionStatus.FAILED, settled.status)
        assertEquals("بلغت حدّ خطتك", settled.result!!.error)
    }
}
