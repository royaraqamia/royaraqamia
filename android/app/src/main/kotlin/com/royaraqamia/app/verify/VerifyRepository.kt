package com.royaraqamia.app.verify

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.VerifyRequest
import com.royaraqamia.app.contracts.generated.VerifyResult

/**
 * The certificate check (#658): the one route the site's form posts to.
 *
 * `/api/certificates/verify` is public by design — a visitor with no account can
 * check a code, and the rate limiter, not a session, is what bounds it — so the
 * request goes out with no bearer ([ApiClient.postPublic]).
 *
 * The body is the generated `VerifyRequest`, so a field the route stops accepting
 * is a compile error in the app rather than a check that always answers "not
 * found". The answer is a value either way: an unknown code is the server saying
 * `success: false`, which is a state the screen draws, not an exception.
 */
class VerifyRepository(private val client: ApiClient) {
    suspend fun verify(code: String): ApiResult<VerifyResult> =
        client.postPublic(VERIFY_PATH, ContractCodec.encode(VerifyRequest(code)))

    companion object {
        const val VERIFY_PATH = "/api/certificates/verify"

        /**
         * What the site's field does as the visitor types: a certificate code is
         * upper case, so a pasted lower-case one is accepted rather than answered
         * "not found" for a difference that is not in the record.
         */
        fun normalizeCode(code: String): String = code.trim().uppercase()
    }
}
