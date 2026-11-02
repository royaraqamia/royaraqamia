package com.royaraqamia.app.shell

/**
 * The routes the shell draws itself, and the ones it hands to the document
 * (#647, #872).
 *
 * **The set is empty on purpose.** A native screen is a second drawing of a
 * surface the site already draws, and the copies had drifted: a bare Material card
 * where the site has its glass sign-in card, a bottom sheet without the site's
 * per-row grips, HabitFlow and SpendTrack in the app's own layout, and a feed that
 * arrived after the document was already the answer. One design was never what the
 * two clients were actually shipping, so the document is the default until a port
 * proves it is the same screen.
 *
 * A route arrives here only with the change that makes its port indistinguishable
 * from the page - same layout, same states, same words - and the same change
 * flips its row in `docs/mobile/screens.json` from `enabled: false` to enabled.
 * `docs/adr/0117-the-document-is-the-app-until-a-port-is-the-same-screen.md`
 * records the decision and the gate that has to pass first.
 *
 * The list survives rather than being deleted because the mechanism is what a
 * passing port needs: [isNative] is the one question the shell asks.
 */
object NativeSurfaces {
    /**
     * Nothing yet. A route arrives here with the pull request that makes its port
     * indistinguishable from the page, never before it.
     */
    private val routes: Set<String> = emptySet()

    /** Whether the shell can draw [route] without the document. */
    fun isNative(route: String): Boolean = routes.contains(Routes.normalize(route))
}
