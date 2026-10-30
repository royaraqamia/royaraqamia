package com.royaraqamia.app.shell

/**
 * The three primary destinations (#647): the only routes that wear the tab bar.
 *
 * The list is the site's — `frontend/ui/navbar/BottomTabBar.tsx` over
 * `route-kind.ts` — and so is the test for which one is active, so tapping a tab
 * in the app and following the same link on the site land on the same screen with
 * the same tab lit.
 *
 * This is the routing half only. The words and the glyphs are the bar's
 * (`ShellTabBar.kt`, from `shared/copy/shell-tab-bar.json` and
 * `shared/icons/icons.json`), because a destination is a route and a title is
 * something a component draws.
 */
sealed interface ShellTab {
    val route: String

    /** Whether this tab is the active one while the shell shows [current]. */
    fun isActive(current: String): Boolean

    data object Home : ShellTab {
        override val route: String = Routes.HOME

        override fun isActive(current: String): Boolean = Routes.normalize(current) == route
    }

    data object Community : ShellTab {
        override val route: String = "/community"

        override fun isActive(current: String): Boolean {
            val normalized = Routes.normalize(current)
            return normalized == route || normalized.startsWith("$route/")
        }
    }

    data object Account : ShellTab {
        override val route: String = "/account"

        override fun isActive(current: String): Boolean = Routes.normalize(current).startsWith(route)
    }

    companion object {
        /** The bar's slots, in the site's order. */
        val all: List<ShellTab> = listOf(Home, Community, Account)

        /** The tab a route belongs to, or null on a secondary page. */
        fun forRoute(route: String): ShellTab? = all.firstOrNull { it.isActive(route) }
    }
}
