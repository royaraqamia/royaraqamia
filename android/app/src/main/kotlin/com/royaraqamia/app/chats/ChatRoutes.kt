package com.royaraqamia.app.chats

import com.royaraqamia.app.shell.Routes

/**
 * The routes the chats surface answers (#819).
 *
 * `/chats/<id>` is the site's thread route, and the id is one segment: the same
 * grammar the shell already applies to `/community/<slug>` and `/u/<username>`.
 * `/chats/new` is the site's new-conversation screen, which the app draws itself
 * (#934), so it is deliberately *not* a thread.
 */
object ChatRoutes {
    private val pattern = Regex("^/chats/([^/]+)$")

    /** The conversation a route names, or null when it is not a thread. */
    fun idOf(route: String?): String? {
        val normalized = Routes.normalize(route)
        val raw = pattern.matchEntire(normalized)?.groupValues?.getOrNull(1) ?: return null
        val id = decode(raw).trim()
        if (id.isEmpty() || id == NEW_SEGMENT) return null
        return id
    }

    /** Whether [route] is one thread's screen. */
    fun matches(route: String?): Boolean = idOf(route) != null

    /**
     * Whether [route] is the notification centre with the chats tab open.
     *
     * The list has no route of its own - `perf/surfaces.json` gives the surface
     * `/chats/[id]` and `/chats/new` - so the tab is what opens it, and the query
     * is the site's own way of naming a tab.
     */
    fun isChatsTab(route: String?): Boolean =
        Routes.normalize(route) == Routes.NOTIFICATIONS_ROUTE &&
            (route ?: "").contains("tab=chats")

    /** The route a row carries for [conversationId]. */
    fun threadOf(conversationId: String): String = "/chats/" + encode(conversationId)

    private const val NEW_SEGMENT = "new"

    private fun decode(value: String): String =
        runCatching { java.net.URLDecoder.decode(value, "UTF-8") }.getOrElse { value }

    private fun encode(value: String): String =
        runCatching { java.net.URLEncoder.encode(value, "UTF-8") }.getOrElse { value }
}
