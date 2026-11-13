package com.royaraqamia.app.athkar

import kotlinx.serialization.Serializable

/**
 * The Athkar reader's vendored text, as the files under `data/athkar` store it (#1389).
 *
 * The two files are copied into the APK from the site's own directory rather
 * than retyped, so a correction to a dhikr cannot reach the page and miss the
 * app. The contract is the site's own (`shared/contracts/athkar.ts`); a field the
 * screen does not draw is ignored by the decoder rather than copied a second
 * time.
 */
@Serializable
data class AthkarCollection(
    val period: String,
    val title: String,
    val items: List<AthkarItem> = emptyList(),
)

/** One dhikr: its text, the count the narration states, its source and virtue. */
@Serializable
data class AthkarItem(
    val id: String,
    val text: String,
    val repeat: Int = 1,
    val virtue: String? = null,
    val source: AthkarSource,
)

/** The collection the text is narrated in, and where in it. */
@Serializable data class AthkarSource(val label: String, val ref: String)

/** The two sittings, as the page's routes name them (ADR-0147). */
enum class AthkarPeriod(val key: String, val route: String) {
    Morning("morning", "/athkar"),
    Evening("evening", "/athkar/evening"),
    ;

    companion object {
        /** The sitting a route names, or null when it is not an Athkar route. */
        fun ofRoute(route: String?): AthkarPeriod? = entries.firstOrNull { it.route == route }
    }
}
