package com.royaraqamia.app.assistant

import com.royaraqamia.app.chats.ChatComposeFile
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.chats.ChatsRepository
import com.royaraqamia.app.contracts.ApiResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** One turn, as the sheet and the chats row read it while it runs. */
data class AssistantTurn(
    /** What نور is doing now, or null when no turn is running. */
    val phase: AssistantPhase? = null,
    /** The present-tense line a tool phase draws, from the server's own table. */
    val toolLabel: String? = null,
    /** The answer as it arrives; empty until the first token. */
    val streaming: String = "",
    /** What this turn read, in the member's words — provenance, not a live line. */
    val tools: List<String> = emptyList(),
    /** The refusal a failed turn carries, already a sentence. */
    val notice: String? = null,
    /** Bumped when the turn ends, so a sheet that is open can re-read the thread. */
    val settledAt: Long = 0L,
)

/**
 * The assistant's turns, owned above the sheet (ADR-0173).
 *
 * The sheet is a modal: dismissing it leaves the composition, and a turn started
 * there used to be cancelled with it. But a turn is the member's request and it
 * may still be writing when they close the panel — and the chats row is supposed
 * to say so. This store is that lifetime: it runs the stream on a scope the
 * graph owns, keeps one [AssistantTurn] per conversation, and hands both screens
 * the same phase.
 *
 * It is deliberately not a cache of the answer: the thread's own read is the
 * record, and this only lives until the turn settles.
 */
class AssistantTurnStore(
    private val repository: ChatsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    private val _turns = MutableStateFlow<Map<String, AssistantTurn>>(emptyMap())
    val turns: StateFlow<Map<String, AssistantTurn>> = _turns.asStateFlow()

    /** Whether a turn is still running in this conversation. */
    fun isAsking(conversationId: String): Boolean = _turns.value[conversationId]?.phase != null

    /**
     * Starts a turn, or does nothing when one is already running: the composer's
     * stop button is the only thing that may end the current answer.
     */
    fun start(conversationId: String, body: String, files: List<ChatComposeFile>) {
        if (isAsking(conversationId)) return
        update(conversationId) { AssistantTurn(phase = AssistantPhase.Thinking) }

        scope.launch {
            var notice: String? = null
            val result =
                repository.streamAssistant(conversationId, body, files) { event ->
                    when (event) {
                        is AssistantEvent.Delta ->
                            if (event.text.isNotEmpty()) {
                                update(conversationId) {
                                    it.copy(
                                        phase = AssistantPhase.Writing,
                                        toolLabel = null,
                                        streaming = it.streaming + event.text,
                                    )
                                }
                            }
                        is AssistantEvent.ToolStart ->
                            update(conversationId) {
                                it.copy(
                                    phase = AssistantPhase.Tool,
                                    toolLabel = event.activity,
                                )
                            }
                        is AssistantEvent.Tool ->
                            update(conversationId) {
                                it.copy(
                                    // The model is deciding again once the tool
                                    // returns; the next token turns this to writing.
                                    phase = AssistantPhase.Thinking,
                                    toolLabel = null,
                                    // A failed read produced nothing to cite.
                                    tools = if (event.ok) it.tools + event.label else it.tools,
                                )
                            }
                        is AssistantEvent.Proposal ->
                            update(conversationId) {
                                it.copy(phase = AssistantPhase.Proposal, toolLabel = null)
                            }
                        is AssistantEvent.Error -> notice = event.message
                        AssistantEvent.Done -> Unit
                    }
                }

            if (result is ApiResult.Failure) {
                notice = notice ?: ChatFailure.sentenceOf(result.error) ?: AssistantPanelCopy.FAILED
            }

            update(conversationId) {
                it.copy(
                    phase = null,
                    toolLabel = null,
                    streaming = "",
                    notice = notice,
                    settledAt = it.settledAt + 1,
                )
            }
        }
    }

    /** A sign-out is a different member: nothing of the previous one may stay. */
    fun clear() {
        _turns.value = emptyMap()
    }

    private fun update(conversationId: String, change: (AssistantTurn) -> AssistantTurn) {
        _turns.update { turns ->
            turns + (conversationId to change(turns[conversationId] ?: AssistantTurn()))
        }
    }
}
