package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.MyUsageResponse
import com.royaraqamia.app.contracts.generated.MyUsageResponseStatePlan

/** The allowance card's two facts (#947): which plan is in force, and whether it is unlimited. */
data class AccountUsage(
    val plan: String,
    val unlimited: Boolean,
)

/**
 * The allowance card's one read (#947): `/api/me/usage`, the route the page's
 * `UsageCard` reads through `useMyUsage`.
 *
 * It is deliberately not the plan page's `/api/me/plan`: the account card draws
 * only the plan and the two ways to act on it, while `/account/plan` is the page
 * that states the whole allowance. Reading the narrower body is what lets the
 * card stay the page's card rather than a second, differently shaped summary
 * (ADR-0098).
 *
 * The repository is the seam the card draws through, so the card is a function
 * of a state and a test can hold "what the route returns" without a socket or a
 * session. It is also the only place that spells the path.
 */
class AccountUsageRepository(private val client: ApiClient) {
    suspend fun load(): ApiResult<AccountUsage> =
        when (val result = client.get<MyUsageResponse>(PATH)) {
            is ApiResult.Success ->
                ApiResult.Success(
                    AccountUsage(
                        plan = result.value.state.plan.id(),
                        unlimited = result.value.state.unlimited,
                    ),
                )
            // A failure is passed through as it is: the card decides what a
            // signed-out read and a server error look like.
            is ApiResult.Failure -> result
        }

    companion object {
        /** The route the page's `UsageCard` reads. */
        const val PATH = "/api/me/usage"

        /** The contract id the copy is looked up by; exhaustive so a new plan is a compile error. */
        private fun MyUsageResponseStatePlan.id(): String =
            when (this) {
                MyUsageResponseStatePlan.FREE -> "free"
                MyUsageResponseStatePlan.PRO -> "pro"
            }
    }
}
