package com.royaraqamia.app.shell

import com.royaraqamia.app.verify.VerifyRoutes

/**
 * The routes the shell draws itself, the ones it hands over, and the ones a guest
 * may read (#647, #658).
 *
 * `/habitflow` arrived with the list screen (#649), `/account/plan` with the
 * account area (#657), SpendTrack's two routes with its screen (#653), and
 * `/verify` with the certificate check (#658); every other destination is still
 * the document — home and community are #658, the rest of the account pages #657.
 * A destination arrives here when a `*Screen.kt` exists for it, which is also the
 * pull request that adds its row to `docs/mobile/screens.json`; the two facts are
 * the same fact, so they are kept in one place.
 *
 * It is a set rather than a flag because the shell's own frame is unchanged either
 * way: what differs is whether a route opens the document or fills the content
 * area (`ShellFrame`).
 *
 * [public] is the second list, and it is the site's `perf/surfaces.json` answer
 * rather than a third opinion: a route whose matrix row a visitor can read with no
 * session must not be covered by the sign-in card. `/verify` is the first, because
 * checking someone else's certificate is exactly what a visitor does.
 */
object NativeSurfaces {
    private val routes: Set<String> =
        setOf(
            "/habitflow",
            "/spendtrack",
            "/spendtrack/categories",
            "/account/plan",
            "/account/connected-apps",
            "/verify",
            "/rates",
        )

    /**
     * The routes a signed-out visitor reads: the app draws them and never covers
     * them with the sign-in card.
     */
    private val publicRoutes: Set<String> = setOf("/verify", "/rates")

    /** Whether the shell can draw [route] without the document. */
    fun isNative(route: String): Boolean =
        routes.contains(Routes.normalize(route)) || VerifyRoutes.matches(route)

    /** Whether [route] is readable with no session (the matrix's public rows). */
    fun isPublic(route: String): Boolean =
        publicRoutes.contains(Routes.normalize(route)) || VerifyRoutes.matches(route)

    /** How many destinations the shell draws, for the check that reads this list. */
    val count: Int get() = routes.size
}
