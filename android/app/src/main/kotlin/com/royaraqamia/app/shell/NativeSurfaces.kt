package com.royaraqamia.app.shell

import com.royaraqamia.app.community.CommunityRoutes
import com.royaraqamia.app.linksnap.LinksnapRoutes
import com.royaraqamia.app.profile.ProfileRoutes
import com.royaraqamia.app.quran.QuranRoutes
import com.royaraqamia.app.verify.VerifyRoutes

/**
 * The routes the shell draws itself, the ones it hands to the document, and the
 * ones a guest may read (#647, #872).
 *
 * **A port is drawn only after the gate.** A native screen is a second drawing of
 * a surface the site already draws, and the copies had drifted: a bare Material card
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
     * The ports that have passed the visual gate. A route arrives here with the
     * pull request that makes its port indistinguishable from the page, never
     * before it (#874, ADR-0118).
     */
    private val routes: Set<String> = setOf("/verify", "/account/faq", "/linksnap")

    /**
     * The routes a signed-out visitor reads.
     *
     * This is the site's `perf/surfaces.json` answer rather than a third opinion: a
     * route whose matrix row a visitor can read with no session must never be
     * covered by a sign-in card. Nothing is covered today - the document decides -
     * but a port that brings a guest prompt back reads the list here instead of
     * rebuilding it, and #872's feed already asserts against it.
     */
    private val publicRoutes: Set<String> = setOf("/verify", "/rates", "/community")

    /** Whether the shell can draw [route] without the document. */
    fun isNative(route: String): Boolean =
        routes.contains(Routes.normalize(route)) || QuranRoutes.matches(route)

    /** Whether [route] is readable with no session (the matrix's public rows). */
    fun isPublic(route: String): Boolean =
        publicRoutes.contains(Routes.normalize(route)) ||
            VerifyRoutes.matches(route) ||
            CommunityRoutes.matches(route) ||
            ProfileRoutes.matches(route) ||
            QuranRoutes.matches(route) ||
            LinksnapRoutes.codeOf(route) != null
}
