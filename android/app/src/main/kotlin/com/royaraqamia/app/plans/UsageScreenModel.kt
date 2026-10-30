package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.generated.MyPlanResponse
import com.royaraqamia.app.contracts.generated.MyPlanResponseStatePlan

/**
 * The plan card's model (#647, #648, ADR-0098).
 *
 * Built from the body `GET /api/me/plan` returns — the same route the site's
 * `/account/plan` reads, so the card cannot show fewer rows than the page it
 * mirrors. [rows] is the one list the card draws: counted actions first, then the
 * owned-item caps, because a member reads "what is left" in one place rather than
 * guessing which of two lists a number belongs to (ADR-0093).
 *
 * The generated type is what makes "a contract change breaks the app build" true:
 * remove or rename `state.plan` or `limits[].remaining` in
 * `shared/contracts/plans.ts`, regenerate, and this file stops compiling.
 */
data class UsageScreenModel(
    val plan: String,
    val unlimited: Boolean,
    val expiresAt: String?,
    val rows: List<Row>,
) {
    /** One label and the numbers beside it, in the site's own words. */
    data class Row(
        val key: String,
        val label: String,
        val used: Long,
        val cap: Long,
    )

    companion object {
        fun from(response: MyPlanResponse): UsageScreenModel =
            UsageScreenModel(
                plan = response.state.plan.id(),
                unlimited = response.state.unlimited,
                expiresAt = response.state.expiresAt,
                rows =
                    response.state.counters.map { counter ->
                        Row(
                            key = counter.key,
                            label = counter.label,
                            used = counter.used,
                            cap = counter.cap,
                        )
                    } +
                        response.limits.map { limit ->
                            Row(
                                key = limit.key,
                                label = limit.label,
                                used = limit.used,
                                cap = limit.cap,
                            )
                        },
            )

        /**
         * The plan's contract id, which is what the copy is looked up by. An
         * exhaustive `when` on the generated enum, so a plan added to the schema
         * is a compile error here instead of a blank label.
         */
        private fun MyPlanResponseStatePlan.id(): String =
            when (this) {
                MyPlanResponseStatePlan.FREE -> "free"
                MyPlanResponseStatePlan.PRO -> "pro"
            }
    }
}
