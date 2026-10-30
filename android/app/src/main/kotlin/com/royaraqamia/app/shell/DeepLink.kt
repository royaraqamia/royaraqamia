package com.royaraqamia.app.shell

import java.net.URI

/**
 * The two link shapes the app answers, turned into the route they mean (#647).
 *
 * A verified App Link arrives as the https URL already; the provider return from a
 * sign-in that left for the system browser arrives on our own scheme, because
 * Google refuses its consent screen inside an embedded browser. Both have to become
 * one path before the shell can route them, and the mapping is the same one the
 * WebView shell does in `MainActivity` — this is its native half.
 *
 * A link that is not ours is `null`, never a best guess. The origin check is the
 * point: an App Link from another host would otherwise be a route the app agrees to
 * open, and `royar://` is a scheme any app on the device can send.
 */
object DeepLink {
    const val SCHEME = "royar"
    const val HOST = "royaraqamia.com"

    /**
     * The only first segment our own scheme carries. `royar://auth/callback` is the
     * provider return and nothing else: any app on the device can send a custom
     * scheme, so a scheme that accepted every authority would be a route the app
     * agrees to open on a stranger's word.
     */
    private const val RETURN_AUTHORITY = "auth"

    /** The site's origin, which the app hands a route to while a surface is still the document. */
    const val WEB_ORIGIN = "https://$HOST"

    /**
     * The in-app target a link names: an absolute path on our origin, query kept.
     *
     * The query is kept because it carries the proof a return trip needs
     * (`/auth/callback?code=…&state=…`); it plays no part in which destination is
     * shown, which is [Routes.normalize]'s decision.
     */
    fun targetOf(link: String?): String? {
        if (link.isNullOrBlank()) return null
        val uri =
            try {
                URI(link)
            } catch (_: Exception) {
                return null
            }

        val scheme = uri.scheme?.lowercase() ?: return null
        val path =
            when (scheme) {
                // A custom-scheme URI puts the first segment in the authority and
                // leaves it out of the path — `royar://auth/callback` has authority
                // "auth" and path "/callback". Dropping it would truncate the route.
                SCHEME -> {
                    val authority = uri.authority?.takeIf { it.isNotEmpty() } ?: return null
                    if (!RETURN_AUTHORITY.equals(authority, ignoreCase = true)) return null
                    "/$authority${uri.path.orEmpty()}"
                }
                "https" -> {
                    if (!HOST.equals(uri.host, ignoreCase = true)) return null
                    uri.path.orEmpty().ifEmpty { Routes.HOME }
                }
                else -> return null
            }

        val query = uri.query?.let { "?$it" }.orEmpty()
        return if (path.startsWith("/")) path + query else "/$path$query"
    }

    /** The URL a web-backed surface is opened at, for a route the shell resolved. */
    fun webUrl(route: String): String =
        WEB_ORIGIN + (if (route.startsWith("/")) route else "/$route")
}
