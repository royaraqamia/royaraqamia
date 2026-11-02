package com.royaraqamia.app.profile

import com.royaraqamia.app.shell.Routes

/**
 * The public profile links the app answers (#658).
 *
 * `/u/<username>` is a member's page on the site, and a guest reads it: the
 * matrix lists `profile` as public server-owned content. The app has no profile
 * screen yet, so the shell opens the document for it — but the route has to be
 * *recognised* as public now, because the feed's cards link to it and a guest
 * who taps a publisher must not be told to sign in (ADR-0031's distinction,
 * applied to navigation).
 */
object ProfileRoutes {
    private val pattern = Regex("^/u/([^/]+)$")

    /** The username a profile link carries, or null when [route] is not one. */
    fun usernameOf(route: String?): String? {
        val normalized = Routes.normalize(route)
        val raw = pattern.matchEntire(normalized)?.groupValues?.getOrNull(1) ?: return null
        return decode(raw).trim().takeIf { it.isNotEmpty() }
    }

    /** Whether [route] is a profile link. */
    fun matches(route: String?): Boolean = usernameOf(route) != null

    /** The route a card carries for [username]. */
    fun profileOf(username: String): String = "/u/${encode(username)}"

    private fun decode(value: String): String =
        runCatching { java.net.URLDecoder.decode(value, "UTF-8") }.getOrElse { value }

    private fun encode(value: String): String =
        runCatching { java.net.URLEncoder.encode(value, "UTF-8") }.getOrElse { value }
}
