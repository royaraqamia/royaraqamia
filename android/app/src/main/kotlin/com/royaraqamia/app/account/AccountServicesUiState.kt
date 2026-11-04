package com.royaraqamia.app.account

import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the hidden-services screen can show (#978, ADR-0098): the four faces the
 * page draws — the spinner, the guest's way in, the failure and the switch list.
 *
 * They are separate cases because the screen's next move differs in each, and
 * because the page draws them separately: a guest is pointed at sign-in rather
 * than shown an empty list, and a failure keeps the server's own sentence when it
 * gave one. [Ready] carries the hidden set the server holds, not a pointer into a
 * client copy, so restoring a service is the answer the account actually kept.
 *
 * [from] is the whole decision in one place, so the screen is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface AccountServicesUiState {
    /** The read is out; the screen draws the page's spinner. */
    data object Loading : AccountServicesUiState

    /** There is no session, so there is no preference to read. */
    data object SignedOut : AccountServicesUiState

    /** The read did not produce a set; [message] is the server's words, if any. */
    data class Failed(val message: String?) : AccountServicesUiState

    /** The routes this account hid, which may be none. */
    data class Ready(val hidden: Set<String>) : AccountServicesUiState

    companion object {
        fun from(result: ApiResult<Set<String>>): AccountServicesUiState =
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
