package com.royaraqamia.app.plans

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.MyPlanResponse

/**
 * The plan card's one read (#647, #648, ADR-0098): `/api/me/plan`, mapped to the
 * model the card draws.
 *
 * It is the route the site's `/account/plan` reads, not the narrower
 * `/api/me/usage` the card used to call: the page shows the counted actions, the
 * owned-item caps and the expiry together, and a client that reads a different
 * body silently shows less than the design does. One surface, one route.
 *
 * The repository exists rather than the card calling the client, so the card is a
 * function of a state and a test can hold "what one route returns from the server"
 * without a socket, a session or a Compose runtime. It is also the only place that
 * spells the path, which is the thing a route rename has to change exactly once.
 */
class UsageRepository(private val client: ApiClient) {
    suspend fun load(): ApiResult<UsageScreenModel> =
        when (val result = client.get<MyPlanResponse>(PATH)) {
            is ApiResult.Success -> ApiResult.Success(UsageScreenModel.from(result.value))
            // A failure is passed through as it is: the card decides what a
            // signed-out read and a server error look like, and it cannot do that
            // if the repository flattens them.
            is ApiResult.Failure -> result
        }

    companion object {
        /** The route the site's `/account/plan` reads. */
        const val PATH = "/api/me/plan"
    }
}
