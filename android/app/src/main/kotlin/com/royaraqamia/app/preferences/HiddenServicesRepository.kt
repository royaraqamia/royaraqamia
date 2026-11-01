package com.royaraqamia.app.preferences

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.HiddenServicesResult

/**
 * The services this member hid (ADR-0112), read from the same route the site's
 * menu reads — `/api/me/hidden-services` — so the shell's `خدماتنا` sheet and the
 * document's menu cannot disagree about what is hidden.
 *
 * Read-only on purpose: the page that *sets* this is `/account/services`, which
 * the shell opens as the document (the account surfaces are the site's until
 * phase 4, `docs/mobile/screens.json`). A write path here would be a second
 * client of a form the user never sees natively.
 */
class HiddenServicesRepository(private val client: ApiClient) {
    /** The hidden routes, or why they could not be read. */
    suspend fun list(): ApiResult<Set<String>> =
        when (val result = client.get<HiddenServicesResult>(PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(
                        ApiError.Server(200, body.error ?: "the hidden set was refused")
                    )
                } else {
                    ApiResult.Success(body.data.orEmpty().toSet())
                }
            }
            is ApiResult.Failure -> result
        }

    companion object {
        const val PATH = "/api/me/hidden-services"
    }
}
