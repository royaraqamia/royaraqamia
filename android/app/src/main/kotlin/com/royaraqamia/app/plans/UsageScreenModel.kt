package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.generated.MyPlanResponse
import com.royaraqamia.app.contracts.generated.MyPlanResponseActivationsItemMethod
import com.royaraqamia.app.contracts.generated.MyPlanResponseStatePlan

/**
 * The plan card's model (#647, #648, ADR-0098).
 *
 * Built from the body `GET /api/me/plan` returns — the same route the site's
 * `/account/plan` reads, so the card cannot show fewer numbers than the page it
 * mirrors. The card draws one meter per key the account holds ([Meter]); the
 * counted actions the same body carries are enforced where they happen, not
 * summed into a standing total (ADR-0093).
 *
 * The generated type is what makes "a contract change breaks the app build" true:
 * remove or rename `state.plan` or `limits[].remaining` in
 * `shared/contracts/plans.ts`, regenerate, and this file stops compiling.
 */
data class UsageScreenModel(
    val plan: String,
    val unlimited: Boolean,
    val expiresAt: String?,
    /**
     * One meter per owned key the account holds at least one row in, closest to
     * its cap first. A key it holds nothing in draws no meter: the sum of every
     * cap described no decision the member was making (#1951).
     */
    val meters: List<Meter>,
    val activations: List<Activation>,
) {
    /**
     * One owned key's standing allowance: the label the API carries, how many
     * rows the account holds, the plan's cap for that key, and the whole
     * percentage between them.
     */
    data class Meter(
        val key: String,
        val label: String,
        val used: Long,
        val cap: Long,
        val share: Int,
    )

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
            // One meter per key the account holds something in: a counted action
            // (a download, a scan, a surah) is a number of times that resets and
            // is not a slot, and a key with no rows is not in use. The site's
            // `standingMeters` derives the same rows from the same `limits` body.
            val meters =
                response.limits
                    .filter { it.used > 0L && it.cap > 0L }
                    .map { limit ->
                        Meter(
                            key = limit.key,
                            label = limit.label,
                            used = limit.used,
                            cap = limit.cap,
                            share = minOf(100, Math.round(100.0 * limit.used / limit.cap).toInt()),
                        )
                    }
                    // The site draws the key closest to its wall first.
                    .sortedWith(
                        compareByDescending<Meter> { it.share }
                            .thenByDescending { it.used }
                            .thenBy { it.key }
                    )

            return UsageScreenModel(
                plan = response.state.plan.id(),
                unlimited = response.state.unlimited,
                expiresAt = response.state.expiresAt,
                meters = meters,
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
