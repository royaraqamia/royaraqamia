package com.royaraqamia.app.preferences

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.HiddenServicesResult
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The services this member hid (ADR-0112), read from the same route the site's
 * menu reads — `/api/me/hidden-services` — so the shell's `خدماتنا` sheet and the
 * document's menu cannot disagree about what is hidden.
 *
 * The same route carries the write (#978): the account screen replaces the whole
 * set, exactly as the page does, because one server record is what makes a
 * restore in the app visible to the page after its next read (ADR-0098).
 */
class HiddenServicesRepository(private val client: ApiClient) {
    /** The hidden routes, or why they could not be read. */
    suspend fun list(): ApiResult<Set<String>> =
        when (val result = client.get<HiddenServicesResult>(PATH)) {
            is ApiResult.Success -> across(result.value)
            is ApiResult.Failure -> result
        }

    /**
     * Replace the whole hidden set, the operation the page's switches make.
     *
     * The server's answer is the set it kept, not the one this client sent: a
     * route the catalog no longer has is ignored there, and the screen draws
     * what the account actually holds.
     */
    suspend fun replace(hidden: Set<String>): ApiResult<Set<String>> =
        when (
            val result =
                client.put<HiddenServicesResult>(
                    PATH,
                    buildJsonObject {
                            put("hidden", buildJsonArray { hidden.forEach { add(JsonPrimitive(it)) } })
                        }
                        .toString(),
                )
        ) {
            is ApiResult.Success -> across(result.value)
            is ApiResult.Failure -> result
        }

    private fun across(body: HiddenServicesResult): ApiResult<Set<String>> =
        if (!body.success) {
            ApiResult.Failure(ApiError.Server(200, body.error ?: "the hidden set was refused"))
        } else {
            ApiResult.Success(body.data.orEmpty().toSet())
        }

    companion object {
        const val PATH = "/api/me/hidden-services"
    }
}
