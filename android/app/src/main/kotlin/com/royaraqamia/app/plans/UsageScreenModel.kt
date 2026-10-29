package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.generated.MyUsageResponse
import com.royaraqamia.app.contracts.generated.MyUsageResponseStatePlan

/**
 * The account card's model, built from the endpoint's generated type (#648).
 *
 * This is deliberately the first consumer of a generated contract: it is what
 * makes "a contract change breaks the app build" true rather than aspirational.
 * Remove or rename `state.plan`, `counters[].remaining` or any other field read
 * here in `shared/contracts/plans.ts`, regenerate, and this file stops
 * compiling.
 */
data class UsageScreenModel(
    val plan: String,
    val unlimited: Boolean,
    val expiresAt: String?,
    val counters: List<Counter>,
) {
    data class Counter(
        val key: String,
        val label: String,
        val used: Long,
        val cap: Long,
        val remaining: Long,
    )

    companion object {
        fun from(response: MyUsageResponse): UsageScreenModel =
            UsageScreenModel(
                plan = response.state.plan.id(),
                unlimited = response.state.unlimited,
                expiresAt = response.state.expiresAt,
                counters = response.state.counters.map { counter ->
                    Counter(
                        key = counter.key,
                        label = counter.label,
                        used = counter.used,
                        cap = counter.cap,
                        remaining = counter.remaining,
                    )
                },
            )

        /**
         * The plan's contract id, which is what the copy is looked up by. An
         * exhaustive `when` on the generated enum, so a plan added to the schema
         * is a compile error here instead of a blank label.
         */
        private fun MyUsageResponseStatePlan.id(): String =
            when (this) {
                MyUsageResponseStatePlan.FREE -> "free"
                MyUsageResponseStatePlan.PRO -> "pro"
            }
    }
}
