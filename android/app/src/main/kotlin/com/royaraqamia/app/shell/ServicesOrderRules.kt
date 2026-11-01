package com.royaraqamia.app.shell

/**
 * The order a visitor gives the services sheet, on the device (#806).
 *
 * The sheet is a personal shortlist: whoever books a consultation twice a week
 * wants that row on top, and the site already lets them arrange it
 * (`frontend/ui/navbar/services-order.ts`). These are the same rules, ported
 * rather than re-invented, because two clients that disagree about where a row
 * belongs are two clients whose menus are different products.
 *
 * Stored as routes rather than positions: a route is what a service *is*, while a
 * position only means something against the list it was measured in. A row the
 * release adds then lands where the shipped order puts it instead of shuffling
 * everything else, and a row it drops simply disappears.
 *
 * Nothing here touches Android: the store is [ServicesOrderStore], so every rule
 * below is a JVM unit test rather than a device check.
 */
object ServicesOrderRules {
    /** The key the site uses in `localStorage`, so a reader finds the same name. */
    const val KEY = "rr:services-order:v1"

    /**
     * The stored routes, or `null` when the device has none this release can read.
     *
     * One route per line rather than the site's JSON array: the app is the only
     * reader of its own preferences file, and a route is a path with no quote,
     * comma or bracket in it to escape. A line that is not a route is dropped,
     * which is the same answer as a hand-edited value on the web.
     */
    fun parse(raw: String?): List<String>? {
        val routes =
            raw?.split('\n')
                .orEmpty()
                .map { it.trim() }
                .filter { it.startsWith("/") && it.length > 1 }
                .distinct()
        return routes.ifEmpty { null }
    }

    fun encode(routes: List<String>): String = routes.joinToString("\n")

    /**
     * A saved order reconciled against the rows that exist right now: saved rows
     * first in their saved places, then anything the release added, in the order
     * the sheet ships it. Routes the release dropped simply disappear.
     */
    fun resolve(defaults: List<String>, saved: List<String>?): List<String> {
        if (saved.isNullOrEmpty()) return defaults.toList()

        val known = defaults.toSet()
        val kept = saved.filter { it in known }.distinct()
        if (kept.isEmpty()) return defaults.toList()

        val seen = kept.toSet()
        return kept + defaults.filterNot { it in seen }
    }

    /** [routes] with the row at [from] moved to [to]; an out-of-range move is refused. */
    fun move(routes: List<String>, from: Int, to: Int): List<String> {
        if (from !in routes.indices) return routes.toList()

        val target = to.coerceIn(0, routes.lastIndex)
        if (target == from) return routes.toList()

        val next = routes.toMutableList()
        val moved = next.removeAt(from)
        next.add(target, moved)
        return next
    }

    /**
     * Which slot a row's dragged centre at [draggedCentreY] is over, given the
     * top of the first row and one row's [rowHeight]. Above the list clamps to
     * the first slot and below it to the last, which is the site's `slotAt`.
     */
    fun slotAt(draggedCentreY: Float, listTop: Float, rowHeight: Float, count: Int): Int {
        if (count <= 0 || rowHeight <= 0f) return 0
        val offset = ((draggedCentreY - listTop) / rowHeight).toInt()
        return offset.coerceIn(0, count - 1)
    }
}
