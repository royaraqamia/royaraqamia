package com.royaraqamia.app.update

import org.json.JSONException
import org.json.JSONObject

/**
 * The typed `426` an owned API answers a build below the floor (#503, ADR-0043).
 *
 * The server can only speak HTTP, so the body carries the one number the app
 * needs; `shared/contracts/app-update.ts` is the schema it is written from, and
 * this is the reading half. It is deliberately strict — a body that does not
 * carry the discriminator, or carries the floor as a string, is not this answer
 * and is reported as `0` — because the alternative is a card that installs an APK
 * on the strength of whatever happened to be in an error body.
 *
 * Pure, and tested on the JVM beside the manifest's own cases.
 */
object ShellUpdateRequired {
    /** HTTP's "upgrade required", the status the floor is answered with. */
    const val STATUS = 426

    /** The body's discriminator, so a `426` is not mistaken for another refusal. */
    const val CODE = "app_update_required"

    /**
     * The floor [body] names, or `0` when this is not that body.
     *
     * `0` rather than an exception: the caller is a request path that has already
     * failed, and an unreadable refusal must not become a second failure.
     */
    @JvmStatic
    fun floorOf(body: String?): Int {
        if (body.isNullOrBlank()) return 0
        val json =
            try {
                JSONObject(body)
            } catch (error: JSONException) {
                return 0
            }
        if (json.optString("code") != CODE) return 0
        // An integer, not `"20021"`: the contract says a number, and coercing a
        // string here would make the app accept a body the site would reject.
        val floor = json.opt("minimumVersionCode") as? Number ?: return 0
        val value = floor.toInt()
        return if (value > 0) value else 0
    }
}
