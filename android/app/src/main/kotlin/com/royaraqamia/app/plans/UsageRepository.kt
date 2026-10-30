package com.royaraqamia.app.plans

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.MyUsageResponse

/**
 * The plan card's one read (#648, #501): `/api/me/usage`, mapped to the model the
 * card draws.
 *
 * The repository exists rather than the card calling the client, so the card is a
 * function of a state and a test can hold "what one route returns from the server"
 * without a socket, a session or a Compose runtime. It is also the only place that
 * spells the path, which is the thing a route rename in `app/api/me/usage` has to
 * change exactly once.
 */
class UsageRepository(private val client: ApiClient) {
    suspend fun load(): ApiResult<UsageScreenModel> =
        when (val result = client.get<MyUsageResponse>(PATH)) {
            is ApiResult.Success -> ApiResult.Success(UsageScreenModel.from(result.value))
            // A failure is passed through as it is: the card decides what a
            // signed-out read and a server error look like, and it cannot do that
            // if the repository flattens them.
            is ApiResult.Failure -> result
        }

    companion object {
        /** The route the site's `/account/plan` reads. */
        const val PATH = "/api/me/usage"
    }
}
