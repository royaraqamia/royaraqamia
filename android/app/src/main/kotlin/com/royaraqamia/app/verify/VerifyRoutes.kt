package com.royaraqamia.app.verify

import com.royaraqamia.app.shell.Routes

/**
 * The certificate links the app answers (#658).
 *
 * `/verify/<code>` is a dynamic route, so it is the first destination the shell
 * cannot list as a string: `NativeSurfaces` matches it by shape, and this is the
 * one place that reads the code out of it. The code is the site's own — upper-case,
 * percent-decoded, no query — because a link printed on a certificate may arrive
 * with either.
 */
object VerifyRoutes {
    private val pattern = Regex("^/verify/([^/]+)$")

    /** The code a certificate link carries, or null when [route] is not one. */
    fun codeOf(route: String?): String? {
        val normalized = Routes.normalize(route)
        val match = pattern.matchEntire(normalized) ?: return null
        val raw = match.groupValues.getOrNull(1) ?: return null
        return decode(raw).trim().uppercase().takeIf { it.isNotEmpty() }
    }

    /** Whether [route] is a certificate link. */
    fun matches(route: String?): Boolean = codeOf(route) != null

    private fun decode(value: String): String =
        runCatching { java.net.URLDecoder.decode(value, "UTF-8") }.getOrElse { value }
}
