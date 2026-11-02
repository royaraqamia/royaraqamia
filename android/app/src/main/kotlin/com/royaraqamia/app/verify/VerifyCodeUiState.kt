package com.royaraqamia.app.verify

import com.royaraqamia.app.contracts.generated.VerifyResultCertificate

/**
 * What a certificate link shows (#658).
 *
 * The site's page is rendered from the server's lookup, so it has two faces: the
 * certificate, or "not in the record". The app reads the code itself — a link can
 * arrive with no radio — so a third face exists on this side, and it is the one that
 * must not be confused with a bad code: [Unreachable] says the check did not run,
 * not that the certificate is unknown.
 */
sealed interface VerifyCodeUiState {
    /** The code resolved to a certificate. */
    data class Found(val certificate: VerifyResultCertificate) : VerifyCodeUiState

    /** The server answered, and has no certificate under this code. */
    data class NotFound(val code: String) : VerifyCodeUiState

    /** The check never reached an answer. */
    data object Unreachable : VerifyCodeUiState

    companion object {
        /**
         * One attempt as a state, asked of the code the link carried.
         *
         * It reuses [VerifyUiState]'s reading of the same route, so a spent
         * allowance and an unknown code cannot be worded two different ways on two
         * screens of one app.
         */
        fun of(code: String, result: com.royaraqamia.app.contracts.ApiResult<com.royaraqamia.app.contracts.generated.VerifyResult>): VerifyCodeUiState =
            when (val state = VerifyUiState.of(result)) {
                is VerifyUiState.Found -> Found(state.certificate)
                VerifyUiState.Unreachable -> Unreachable
                else -> NotFound(code)
            }
    }
}
