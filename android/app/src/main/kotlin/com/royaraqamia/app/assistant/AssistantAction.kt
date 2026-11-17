package com.royaraqamia.app.assistant

import com.royaraqamia.app.contracts.generated.ChatAgentAction
import com.royaraqamia.app.contracts.generated.ChatAgentActionArgs
import com.royaraqamia.app.contracts.generated.ChatAgentActionResult
import com.royaraqamia.app.contracts.generated.ChatAgentActionStatus
import com.royaraqamia.app.contracts.generated.ChatAgentActionResponseAction
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseActionsItem

/**
 * One proposal card, as the sheet keeps it (#1182).
 *
 * The page's messages and the confirm/reject answer carry the same row in two
 * generated shapes because each is a root of its own response. The sheet keeps
 * one shape so a resolution replaces the row it was drawn from rather than
 * appending a second card; the conversion copies fields, never words.
 */
typealias AssistantAction = ChatAgentAction

/** The row read with a page of messages, as the sheet's own type. */
fun ChatMessagePageResponseActionsItem.asAssistantAction(): AssistantAction =
    AssistantAction(
        id = id,
        conversationId = conversationId,
        messageId = messageId,
        tool = tool,
        args = ChatAgentActionArgs(),
        appName = appName,
        status = ChatAgentActionStatus.valueOf(status.name),
        result = result?.let { ChatAgentActionResult(error = it.error) },
        createdAt = createdAt,
        resolvedAt = resolvedAt,
        resolvedBy = resolvedBy,
    )

/** The row an answer to confirm or reject carries. */
fun ChatAgentActionResponseAction.toAssistantAction(): AssistantAction =
    AssistantAction(
        id = id,
        conversationId = conversationId,
        messageId = messageId,
        tool = tool,
        args = ChatAgentActionArgs(),
        appName = appName,
        status = ChatAgentActionStatus.valueOf(status.name),
        result = result?.let { ChatAgentActionResult(error = it.error) },
        createdAt = createdAt,
        resolvedAt = resolvedAt,
        resolvedBy = resolvedBy,
    )
