package com.royaraqamia.app.shell

/**
 * Where the system back gesture goes, and the one case where it leaves (#647).
 *
 * The site decides the same thing in `frontend/ui/shared/back-button.tsx`: if this
 * page load has seen an in-app navigation, pop history; otherwise walk up the URL.
 * A cold launch on a deep link has no history at all, so "pop" would exit the app
 * from a screen the user never chose to be the root — which is the one back
 * behaviour ADR-0082 forbids.
 *
 * So the stack starts at the route that was opened, and the root it may never exit
 * from is [Routes.HOME]:
 *
 * - with history, back pops one entry;
 * - without, a primary destination answers home, and a secondary one answers its
 *   parent route — the site's own walk up the URL;
 * - only home itself returns `false`, which is the back that closes the app.
 */
class ShellBackStack(start: String = Routes.HOME) {
    private val entries = ArrayList<String>()

    init {
        entries.add(start)
    }

    /** The target the shell is showing, query included. */
    val current: String get() = entries.last()

    /** The destination it is showing, which is what a tab's active state compares. */
    val route: String get() = Routes.normalize(current)

    val depth: Int get() = entries.size

    /** Every target, oldest first. Read by the tests and by nothing else. */
    val history: List<String> get() = entries.toList()

    /**
     * Navigate to a target. Opening the destination already showing is a no-op: a
     * second tap on the active tab is not a new history entry, and neither is a
     * deep link for the screen the user is on.
     */
    fun open(target: String) {
        if (Routes.normalize(target) == route) return
        entries.add(target)
    }

    fun replace(target: String) {
        entries[entries.lastIndex] = target
    }

    /**
     * Start again at [target]: a link that arrived while the app was already
     * running replaces the stack, because the route it names is a new entry point
     * rather than somewhere the user walked to.
     */
    fun reset(target: String) {
        entries.clear()
        entries.add(target)
    }

    /** `true` when the back gesture was consumed and the app stays open. */
    fun back(): Boolean {
        if (entries.size > 1) {
            entries.removeAt(entries.lastIndex)
            return true
        }

        if (route == Routes.HOME) return false

        val target = if (Routes.isPrimary(route)) Routes.HOME else Routes.parentOf(route)
        if (Routes.normalize(target) == route) return false
        replace(target)
        return true
    }
}
