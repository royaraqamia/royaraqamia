package com.royaraqamia.app.store.leads

/**
 * The three lead forms the app draws (#929), and the route, intent type and
 * endpoint each one owns.
 *
 * One table rather than a constant repeated in the screen, the transport and
 * the queue: the site's `LeadFormKind` already names the same three, and a form
 * added here without an endpoint would be a queued write nothing can send.
 */
enum class LeadKind(
    val route: String,
    val intentType: String,
    val endpoint: String,
) {
    Training(
        route = "/training/apply",
        intentType = "training.submit",
        endpoint = "/api/training/applications",
    ),
    ProjectRequest(
        route = "/request-project",
        intentType = "project-request.submit",
        endpoint = "/api/project-requests",
    ),
    Retainer(
        route = "/hire",
        intentType = "retainer.submit",
        endpoint = "/api/retainers",
    ),
    ;

    /** The receipt key: one per form, so two confirmations cannot collide. */
    val receiptKind: String
        get() = intentType

    companion object {
        fun ofRoute(route: String?): LeadKind? {
            val clean = (route ?: "/").substringBefore('?').substringBefore('#').trimEnd('/')
            val normalized = if (clean.isEmpty()) "/" else clean
            return entries.firstOrNull { it.route == normalized }
        }

        /** The form an intent belongs to, or `null` for a type this build no longer knows. */
        fun ofIntentType(type: String): LeadKind? =
            entries.firstOrNull { it.intentType == type }
    }
}
