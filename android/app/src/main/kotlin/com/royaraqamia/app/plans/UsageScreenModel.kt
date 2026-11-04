package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.generated.MyPlanResponse
import com.royaraqamia.app.contracts.generated.MyPlanResponseActivationsItemMethod
import com.royaraqamia.app.contracts.generated.MyPlanResponseStatePlan

/**
 * The plan card's model (#647, #648, ADR-0098).
 *
 * Built from the body `GET /api/me/plan` returns — the same route the site's
 * `/account/plan` reads, so the card cannot show fewer numbers than the page it
 * mirrors. The card draws one bar ([share]) over the standing owned-item caps
 * ([used] of [cap]); the counted actions the same body carries are enforced
 * where they happen, not summed into a standing total (ADR-0093).
 *
 * The generated type is what makes "a contract change breaks the app build" true:
 * remove or rename `state.plan` or `limits[].remaining` in
 * `shared/contracts/plans.ts`, regenerate, and this file stops compiling.
 */
data class UsageScreenModel(
    val plan: String,
    val unlimited: Boolean,
    val expiresAt: String?,
    /** The owned-item slots the account holds, summed. */
    val used: Long,
    /** The owned-item slots the plan allows, summed. */
    val cap: Long,
    /** [used] as a whole percentage of [cap]: the one bar the card draws. */
    val share: Int,
    val activations: List<Activation>,
) {
    /**
     * One payment behind the plan, as the page's history lists it: what it cost,
     * how it was paid, when it started and when it runs out, and the note the
     * member left with it. The card draws them in the order the server sends, which
     * is the order the page draws ([ADR-0093]).
     */
    data class Activation(
        val id: String,
        val amountCents: Long,
        val currency: String,
        val method: String,
        val note: String?,
        val activatedAt: String,
        val expiresAt: String,
    )

    companion object {
        fun from(response: MyPlanResponse): UsageScreenModel {
            // The bar counts the standing owned-item caps only: a counted action
            // (a download, a scan, a surah) is a number of times that resets, and
            // folding a daily count into a standing one would make the bar drop at
            // midnight without the member having given anything up. The site's
            // `usageShare` derives the same share from the same `limits` body.
            val used = response.limits.sumOf { it.used }
            val cap = response.limits.sumOf { it.cap }

            return UsageScreenModel(
                plan = response.state.plan.id(),
                unlimited = response.state.unlimited,
                expiresAt = response.state.expiresAt,
                used = used,
                cap = cap,
                share = if (cap <= 0L) 0 else minOf(100, Math.round(100.0 * used / cap).toInt()),
                activations =
                    response.activations.map { activation ->
                        Activation(
                            id = activation.id,
                            amountCents = activation.amountCents,
                            currency = activation.currency,
                            method = activation.method.id(),
                            note = activation.note,
                            activatedAt = activation.activatedAt,
                            expiresAt = activation.expiresAt,
                        )
                    },
            )
        }

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

        /**
         * The payment method's contract id. Exhaustive for the same reason: a
         * method added to `PlanActivationMethodSchema` has to reach the label map.
         */
        private fun MyPlanResponseActivationsItemMethod.id(): String =
            when (this) {
                MyPlanResponseActivationsItemMethod.SHAMCASH -> "shamcash"
                MyPlanResponseActivationsItemMethod.EFENDIM -> "efendim"
                MyPlanResponseActivationsItemMethod.OTHER -> "other"
            }
    }
}
