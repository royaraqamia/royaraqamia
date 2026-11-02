package com.royaraqamia.app.verify

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
import com.royaraqamia.app.contracts.generated.VerifyResultCertificate

/**
 * What the certificate check is showing (#658).
 *
 * The site's `/verify` page declares the same six states from one value
 * (`app/verify/page.tsx`), and `docs/mobile/parity.json` holds the pair, so a
 * state added on one side is a failing check on the other.
 *
 * `Unreachable` is its own state rather than an error sentence because a visitor
 * whose request never left has not been told the code is unknown: the site words
 * the two differently and so does this screen.
 */
sealed interface VerifyUiState {
    /** Nothing asked yet: the form, and nothing under it. */
    data object Idle : VerifyUiState

    /** One check in flight. */
    data object Busy : VerifyUiState

    /** The server knows the code. */
    data class Found(val certificate: VerifyResultCertificate) : VerifyUiState

    /** The server answered, and it has no such code — or refused for a reason it named. */
    data class NotFound(val message: String) : VerifyUiState

    /** The visitor spent their allowance: the server said so, and retrying now cannot help. */
    data class RateLimited(val message: String) : VerifyUiState

    /** The request never reached an answer: no radio, a timeout, a closed socket. */
    data object Unreachable : VerifyUiState

    companion object {
        /**
         * One attempt as a state.
         *
         * The three failures the site cannot tell apart are told apart here for
         * the same reason it draws three: a refusal that names a code is not a
         * refusal to try again later. Everything the client itself failed to read
         * — a drifted body, a 500 — is the site's `unexpected` sentence, which is
         * what its own `catch` answers.
         */
        fun of(result: ApiResult<VerifyResult>): VerifyUiState =
            when (result) {
                is ApiResult.Failure ->
                    when (result.error) {
                        is ApiError.Network -> Unreachable
                        else -> NotFound(VerifyCopy.UNEXPECTED)
                    }
                is ApiResult.Success -> {
                    val body = result.value
                    val certificate = body.certificate
                    when {
                        body.success && certificate != null -> Found(certificate)
                        body.rateLimited == true ->
                            RateLimited(body.error ?: VerifyCopy.RATE_LIMITED_BODY)
                        else -> NotFound(body.error ?: VerifyCopy.UNEXPECTED)
                    }
                }
            }
    }
}
