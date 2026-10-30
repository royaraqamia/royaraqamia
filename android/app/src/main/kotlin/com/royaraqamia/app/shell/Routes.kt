package com.royaraqamia.app.shell

/**
 * The site's route grammar, in the app (#647).
 *
 * The shell navigates by the same routes the site does, so a deep link, a tab tap
 * and the back gesture all resolve to one path and one destination. The reference
 * is `frontend/ui/navbar/route-kind.ts`, which decides the same three things for
 * the web: which routes are *primary* (the three bottom-tab destinations, the only
 * pages that keep the tab bar), which paths exist only to hold children, and where
 * "up" goes when a page load has no history to pop.
 *
 * The list is mirrored rather than generated. It is three strings and an eleven-row
 * table that changes when a folder changes, and a generator would have to read the
 * App Router to know either — the wrong side of the seam for a fact this small.
 * `RoutesTest` pins the behaviour that must agree, and `router.ts`'s own suite keeps
 * the web half honest.
 */
object Routes {
    /** The bottom-tab destinations, and nothing else. */
    val primary: List<String> = listOf("/", "/community", "/account")

    /** The app's root: back from here is the one back that leaves the app. */
    const val HOME = "/"

    /**
     * Paths that exist only to hold children: a directory with no page of its own,
     * on the way to one that has. "Go up" has to step over them, because landing
     * on one is a 404 — `/auth` is a layout, `/consultation` is the folder above
     * `/consultation/book`.
     *
     * `*` matches exactly one segment, which is how a dynamic folder
     * (`/admin/certificates/[id]`) is spelled here.
     */
    private val layoutOnly: List<List<String>> =
        listOf(
            listOf("admin", "certificates", "*"),
            listOf("admin", "clients"),
            listOf("admin", "consultations"),
            listOf("admin", "training"),
            listOf("auth"),
            listOf("blogpress", "editor"),
            listOf("consultation"),
            listOf("linksnap", "unlock"),
            listOf("mcp"),
            listOf("training"),
            listOf("u"),
        )

    /**
     * One route out of a pathname: no query, no fragment, no trailing slash.
     *
     * A route is the identity a destination is keyed by, so `/account/` and
     * `/account` are one route and a link with `?tab=posts` lands on the same
     * destination the site's own router would. A missing pathname is the root.
     */
    fun normalize(path: String?): String {
        val clean = (path ?: HOME).substringBefore('?').substringBefore('#')
        val trimmed = clean.trimEnd('/')
        return if (trimmed.isEmpty()) HOME else trimmed
    }

    fun isPrimary(path: String?): Boolean = path != null && primary.contains(normalize(path))

    private fun segmentsOf(route: String): List<String> = route.split('/').filter { it.isNotEmpty() }

    fun isLayoutOnly(route: String): Boolean {
        val segments = segmentsOf(normalize(route))
        return layoutOnly.any { pattern ->
            pattern.size == segments.size &&
                pattern.indices.all { index ->
                    pattern[index] == "*" || pattern[index] == segments[index]
                }
        }
    }

    /**
     * Where "back" lands when this page load has no in-app history to pop — a cold
     * launch, a shared link, an App Link. Walks up the route to the nearest ancestor
     * that is a real page, and answers the root when there is none.
     */
    fun parentOf(path: String?): String {
        var candidate = normalize(path)

        while (candidate != HOME) {
            val segments = segmentsOf(candidate).toMutableList()
            segments.removeAt(segments.lastIndex)
            if (segments.isEmpty()) return HOME

            candidate = "/" + segments.joinToString("/")
            if (!isLayoutOnly(candidate)) return candidate
        }

        return HOME
    }
}
