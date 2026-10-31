package com.royaraqamia.app.shell

/**
 * The routes the shell draws itself, and the ones it hands over (#647).
 *
 * The list is empty on purpose, and that is its whole content today: no primary
 * surface has a native screen yet — home and community are #658, the account pages
 * #657 — so every destination is still the document. A destination arrives here
 * when a `*Screen.kt` exists for it, which is also the pull request that adds its
 * row to `docs/mobile/screens.json`; the two facts are the same fact, so they are
 * kept in one place.
 *
 * It is a set rather than a flag because the shell's own frame is unchanged either
 * way: what differs is whether a route opens the document or fills the content
 * area (`ShellFrame`).
 */
object NativeSurfaces {
    private val routes: Set<String> = setOf("/habitflow")

    /** Whether the shell can draw [route] without the document. */
    fun isNative(route: String): Boolean = routes.contains(Routes.normalize(route))

    /** How many destinations the shell draws, for the check that reads this list. */
    val count: Int get() = routes.size
}
