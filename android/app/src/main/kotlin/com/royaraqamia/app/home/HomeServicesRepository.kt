package com.royaraqamia.app.home

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.HomeServicesResult
import com.royaraqamia.app.contracts.generated.UpdateHomeServices
import kotlinx.serialization.encodeToString

/**
 * The signed-in member's homepage apps (#1194, ADR-0146): one route, two methods.
 *
 * `GET` answers the routes in tab order; `PUT` replaces the whole ordered set,
 * which is the site's own operation (`/api/me/home-services`) — the strip's truth
 * is "these are the tabs, in this order", so a replace cannot drift the way a
 * delta can. The body and the answer are generated contracts (ADR-0098), so a
 * field the server stops accepting is a compile error in the app.
 *
 * A `success: false` body is the server refusing with its own sentence; it is a
 * [ApiError.Server] here, not an empty success, because the provider draws the
 * refusal rather than pretending the strip moved.
 */
class HomeServicesRepository(private val client: ApiClient) {
    suspend fun read(): ApiResult<List<String>> =
        when (val result = client.get<HomeServicesResult>(PATH)) {
            is ApiResult.Success -> answer(result.value)
            is ApiResult.Failure -> result
        }

    suspend fun replace(routes: List<String>): ApiResult<List<String>> =
        when (
            val result =
                client.put<HomeServicesResult>(
                    PATH,
                    ContractCodec.json.encodeToString(
                        UpdateHomeServices(
                            services = routes.mapNotNull(HomeServicesCatalog::keyOf)
                        )
                    ),
                )
        ) {
            is ApiResult.Success -> answer(result.value)
            is ApiResult.Failure -> result
        }

    private fun answer(body: HomeServicesResult): ApiResult<List<String>> =
        if (body.success) {
            ApiResult.Success(body.data.orEmpty())
        } else {
            ApiResult.Failure(ApiError.Server(200, body.error ?: "the set was refused"))
        }

    companion object {
        const val PATH = "/api/me/home-services"

        /**
         * The server's own sentence from a refusal body, when it is the
         * contract's shape; null for anything else (a proxy page, an empty body),
         * so the caller can fall back to its own sentence rather than drawing
         * transport text at a member.
         */
        fun refusalOf(body: String): String? =
            runCatching { ContractCodec.json.decodeFromString<HomeServicesResult>(body) }
                .getOrNull()
                ?.error
                ?.takeIf { it.isNotBlank() }
    }
}
