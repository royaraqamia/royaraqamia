package com.royaraqamia.app.community

import com.royaraqamia.app.shell.Routes

/**
 * The community links the app answers (#658).
 *
 * `/community/<slug>` is the site's post route, and its slug is the contract's
 * own (`PostSlugSchema`): percent-decoded, no query, one segment. The feed hands
 * it to the shell as a route, so a card says where it goes without knowing
 * whether the destination is a screen or the document.
 *
 * `/u/<username>` is the publisher's profile, and is *not* here: it belongs to
 * the profile surface, which the shell opens as the document until that screen
 * lands.
 */
object CommunityRoutes {
    private val pattern = Regex("^/community/([^/]+)$")

    /** The slug a post link carries, or null when [route] is not one. */
    fun slugOf(route: String?): String? {
        val normalized = Routes.normalize(route)
        val raw = pattern.matchEntire(normalized)?.groupValues?.getOrNull(1) ?: return null
        return decode(raw).trim().takeIf { it.isNotEmpty() }
    }

    /** Whether [route] is a post link. */
    fun matches(route: String?): Boolean = slugOf(route) != null

    /** The route a card carries for [slug]. */
    fun postOf(slug: String): String = "/community/${encode(slug)}"

    private fun decode(value: String): String =
        runCatching { java.net.URLDecoder.decode(value, "UTF-8") }.getOrElse { value }

    private fun encode(value: String): String =
        runCatching { java.net.URLEncoder.encode(value, "UTF-8") }.getOrElse { value }
}
