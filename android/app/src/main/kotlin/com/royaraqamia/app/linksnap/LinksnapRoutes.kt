package com.royaraqamia.app.linksnap

import com.royaraqamia.app.shell.Routes

/**
 * LinkSnap's routes as the app reads them (#654).
 *
 * `/linksnap/unlock/<code>` is the one destination whose code is a segment
 * rather than a whole path, so it is matched here and handed to the screen. The
 * route grammar itself is the site's (`app/linksnap/unlock/[code]/page.tsx`).
 */
object LinksnapRoutes {
    const val UNLOCK_PREFIX = "/linksnap/unlock"

    /** The protected slug in `/linksnap/unlock/<code>`, or null for any other route. */
    fun codeOf(path: String?): String? {
        val route = Routes.normalize(path)
        val segments = route.split('/').filter { it.isNotEmpty() }
        if (segments.size != 3) return null
        if (segments[0] != "linksnap" || segments[1] != "unlock") return null
        return segments[2]
    }

    /** The URL a member copies from a row: the site's own short-link origin. */
    fun shortUrl(siteUrl: String, code: String): String =
        "${siteUrl.trimEnd('/')}/$code"
}
