package com.royaraqamia.app.account

import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the memory screen can show (#1428, ADR-0182 decision 6): the four faces
 * the page draws — the spinner, the guest's way in, the failure, and the memory
 * itself (with or without facts).
 *
 * They are separate cases because the screen's next move differs in each, and
 * because the page draws them separately: a guest is pointed at sign-in rather
 * than shown "nothing remembered", which would be a false statement about
 * somebody else's account. [Ready] carries the facts and the switches, so
 * "remembers nothing" is one state with an empty list, exactly as the page's
 * `facts.length === 0` decides.
 *
 * [from] is the whole decision in one place, so the screen is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface MemoryUiState {
    /** The read is out; the screen draws the page's spinner. */
    data object Loading : MemoryUiState

    /** There is no session, so there is nothing to remember for this guest. */
    data object SignedOut : MemoryUiState

    /** The read did not produce the memory; [message] is the server's words, if any. */
    data class Failed(val message: String?) : MemoryUiState

    /** What the member has saved, and the three switches over it. */
    data class Ready(val memory: AgentMemory) : MemoryUiState {
        val facts: List<MemoryFact>
            get() = memory.facts

        val isEmpty: Boolean
            get() = memory.facts.isEmpty()
    }

    companion object {
        fun from(result: ApiResult<AgentMemory>): MemoryUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (val error = result.error) {
                        ApiError.NotSignedIn -> SignedOut
                        // The transport hands a failed request the raw body, so the
                        // server's Arabic sentence is read out of it rather than
                        // drawn as JSON; a body with none is the screen's own copy.
                        is ApiError.Server -> Failed(ChatFailure.sentenceOf(error))
                        is ApiError.Network,
                        is ApiError.InvalidContract -> Failed(null)
                    }
            }
    }
}
