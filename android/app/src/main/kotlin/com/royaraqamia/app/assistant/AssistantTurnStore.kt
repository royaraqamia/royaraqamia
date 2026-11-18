package com.royaraqamia.app.assistant

import com.royaraqamia.app.chats.ChatComposeFile
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.chats.ChatsRepository
import com.royaraqamia.app.contracts.ApiResult
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
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
    /** What was already written when the member stopped the answer. */
    val interrupted: String = "",
    /** What this turn read, in the member's words — provenance, not a live line. */
    val tools: List<String> = emptyList(),
    /** What the web search read, drawn as the source card (ADR-0206). */
    val sources: List<AssistantSource> = emptyList(),
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
 * A stop cancels the turn's job and keeps what had already arrived as
 * [AssistantTurn.interrupted]; a follow-up sent while a turn runs stops it and
 * starts its own — the same three composer states the site draws.
 */
class AssistantTurnStore(
    private val repository: ChatsRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
) {
    private val _turns = MutableStateFlow<Map<String, AssistantTurn>>(emptyMap())
    val turns: StateFlow<Map<String, AssistantTurn>> = _turns.asStateFlow()
    /** The running stream per conversation, so stop reaches it and a follow-up can replace it. */
    private val jobs = mutableMapOf<String, Job>()

    /** Whether a turn is still running in this conversation. */
    fun isAsking(conversationId: String): Boolean = _turns.value[conversationId]?.phase != null

    /**
     * Starts a turn. One already running is stopped first: a follow-up is a new
     * question, not a duplicate press, and the big brands let it interrupt.
     */
    fun start(conversationId: String, body: String, files: List<ChatComposeFile>) {
        jobs.remove(conversationId)?.cancel()
        update(conversationId) { AssistantTurn(phase = AssistantPhase.Thinking) }

        // The screen is read here, at send, exactly as the site's composer reads
        // it (ADR-0181, decision 6): a navigation after this point does not change
        // where this question came from.
        val screen = PublishedScreen.current()
        val active = AtomicBoolean(true)

        val job =
            scope.launch {
                var notice: String? = null
                val result =
                    repository.streamAssistant(
                        conversationId,
                        body,
                        files,
                        screen,
                        onEvent = { event ->
                            if (active.get()) {
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
                                    is AssistantEvent.Sources ->
                                        update(conversationId) { it.copy(sources = event.sources) }
                                    is AssistantEvent.Proposal ->
                                        update(conversationId) {
                                            it.copy(phase = AssistantPhase.Proposal, toolLabel = null)
                                        }
                                    is AssistantEvent.Error -> notice = event.message
                                    AssistantEvent.Done -> Unit
                                }
                            }
                        },
                        // A stopped turn still owns its uploaded bytes; the
                        // repository must not delete what the stored question names.
                        onStopped = { !active.get() },
                    )

                if (!active.get()) return@launch

                if (result is ApiResult.Failure) {
                    notice = notice ?: ChatFailure.sentenceOf(result.error) ?: AssistantPanelCopy.FAILED
                }

                update(conversationId) {
                    it.copy(
                        phase = null,
                        toolLabel = null,
                        streaming = "",
                        sources = emptyList(),
                        notice = notice,
                        settledAt = it.settledAt + 1,
                    )
                }
                jobs.remove(conversationId)
            }

        jobs[conversationId] = job
    }

    /** Stop the answer in flight; the question and any text already written stay. */
    fun stop(conversationId: String) {
        val current = _turns.value[conversationId] ?: return
        if (current.phase == null) return
        jobs.remove(conversationId)?.cancel()
        update(conversationId) {
            it.copy(
                phase = null,
                toolLabel = null,
                streaming = "",
                interrupted = it.streaming,
                sources = emptyList(),
                notice = null,
                settledAt = it.settledAt + 1,
            )
        }
    }

    /** A sign-out is a different member: nothing of the previous one may stay. */
    fun clear() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        _turns.value = emptyMap()
    }

    private fun update(conversationId: String, change: (AssistantTurn) -> AssistantTurn) {
        _turns.update { turns ->
            turns + (conversationId to change(turns[conversationId] ?: AssistantTurn()))
        }
    }
}
