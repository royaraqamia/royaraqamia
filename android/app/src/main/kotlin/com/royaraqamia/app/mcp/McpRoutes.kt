package com.royaraqamia.app.mcp

/**
 * The marketplace's addresses (#1256).
 *
 * `/mcp/apps` is the surface the sheet draws, and `/mcp/apps/<id>` is one
 * connection's screen — the address the provider's callback lands on when the
 * member returns from consent (ADR-0155, decision 9). The app reads the id out of
 * the route the same way it reads a certificate's code (`VerifyRoutes`), so a
 * shared link, a notification and a callback all resolve to one screen.
 */
object McpRoutes {
    const val APPS = "/mcp/apps"

    private const val PREFIX = "$APPS/"

    /** The connection a detail route names, or null. */
    fun connectionOf(route: String): String? {
        val clean = route.substringBefore('?').substringBefore('#').trimEnd('/')
        if (!clean.startsWith(PREFIX)) return null
        val id = clean.removePrefix(PREFIX)
        // One segment: `/mcp/apps/<id>/tools` is not this screen.
        return id.takeIf { it.isNotEmpty() && !it.contains('/') }
    }

    /** The detail route for one connection. */
    fun detailOf(connectionId: String): String = "$PREFIX$connectionId"
}
