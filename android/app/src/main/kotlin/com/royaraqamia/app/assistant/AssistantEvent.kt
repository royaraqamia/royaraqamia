package com.royaraqamia.app.assistant

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject

/**
 * One frame of an assistant turn, in the shapes the sheet draws (ADR-0143).
 *
 * The route streams `ChatAgentEvent` (`shared/contracts/chat.ts`): a delta as
 * the answer is written, the read tool that ran, a proposal, the ending, or the
 * sentence a failed turn carries. The app parses the four it draws and drops the
 * rest — a frame the model adds later is not a reason to blank a conversation.
 */
sealed interface AssistantEvent {
    /** The answer as it is being written. */
    data class Delta(val text: String) : AssistantEvent

    /** A read tool ran, in the member's words. */
    data class Tool(val label: String) : AssistantEvent

    /**
     * A write was proposed. The sheet does not confirm it — the proposal's card
     * needs the action contract the app has not generated yet — so it only tells
     * the reader that the full conversation has something waiting.
     */
    data class Proposal(val label: String) : AssistantEvent

    /** The turn ended and the stored row is the thread's own read. */
    data object Done : AssistantEvent

    /** The turn's refusal, already a sentence a member can read. */
    data class Error(val message: String) : AssistantEvent
}

private val frameJson = Json { ignoreUnknownKeys = true }

private fun JsonElement?.text(): String? = (this as? JsonPrimitive)?.contentOrNull

/**
 * The parser, kept apart from the socket so a JVM test can feed it the route's
 * own frames — including a `data:` line that is not JSON, which is dropped.
 */
fun parseAssistantEvent(data: String): AssistantEvent? =
    runCatching {
            val frame = frameJson.parseToJsonElement(data).jsonObject
            when (frame["type"].text()) {
                "delta" -> AssistantEvent.Delta(frame["text"].text().orEmpty())
                "tool" -> AssistantEvent.Tool(frame["label"].text().orEmpty())
                "proposal" ->
                    AssistantEvent.Proposal(
                        frame["action"]?.jsonObject?.get("tool").text().orEmpty()
                    )
                "done" -> AssistantEvent.Done
                "error" -> AssistantEvent.Error(frame["error"].text().orEmpty())
                else -> null
            }
        }
        .getOrNull()
