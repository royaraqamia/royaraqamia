package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The route grammar the shell and the site must agree on (#647, #967).
 *
 * The web half is `frontend/ui/__tests__/route-kind.test.ts`, which re-derives the
 * layout-only table from `app/`. This half pins the same answers on the app's side:
 * three tab destinations, the routes that wear the app chrome, a walk up the URL
 * that steps over layout-only folders, and two link shapes that become routes.
 */
class RoutesTest {
    @Test
    fun `a route has no query, no fragment and no trailing slash`() {
        assertEquals("/account", Routes.normalize("/account/"))
        assertEquals("/community/post", Routes.normalize("/community/post?tab=replies#top"))
        assertEquals("/", Routes.normalize(""))
        assertEquals("/", Routes.normalize(null))
        assertEquals("/", Routes.normalize("/"))
    }

    @Test
    fun `exactly three routes are tab destinations`() {
        assertTrue(Routes.isTabDestination("/"))
        assertTrue(Routes.isTabDestination("/community"))
        assertTrue(Routes.isTabDestination("/account"))
        assertTrue(Routes.isTabDestination("/community/"))
        assertTrue(Routes.isTabDestination("/account?tab=posts"))

        assertFalse(Routes.isTabDestination("/community/post"))
        assertFalse(Routes.isTabDestination("/account/plan"))
        assertFalse(Routes.isTabDestination("/rates"))
        assertFalse(Routes.isTabDestination(null))
    }

    @Test
    fun `the app chrome is the page's isPrimaryRoute`() {
        // The three destinations, the nine app roots, the reader's mode and the
        // printed certificate's standalone route (ADR-0149, ADR-0152).
        for (path in
            listOf(
                "/",
                "/community",
                "/account",
                "/news",
                "/rates",
                "/scan",
                "/quran",
                "/athkar",
                "/athkar/evening",
                "/linksnap",
                "/habitflow",
                "/spendtrack",
                "/notes",
                "/verify",
            )) {
            assertTrue("$path wears the app chrome", Routes.isPrimary(path))
        }

        for (path in
            listOf(
                "/community/post",
                "/account/plan",
                "/account/faq",
                "/mcp/guide",
                "/mcp/apps",
                "/quran/2",
                "/auth/callback",
            )) {
            assertFalse("$path wears the secondary chrome", Routes.isPrimary(path))
        }

        assertFalse(Routes.isPrimary(null))
    }

    @Test
    fun `a door address names the app it selects`() {
        // A tab is a query on the door and a port is a route (ADR-0156): the shell
        // resolves one into the other, so a shared link or a redirect still lands
        // on the native screen rather than on the document.
        assertEquals("/habitflow", Routes.appTabOf("/?tab=/habitflow"))
        assertEquals("/rates", Routes.appTabOf("/?tab=%2Frates"))
        assertEquals("/news", Routes.appTabOf("/?tab=/news&from=push"))

        // A tab of another surface is not an app, and a value the catalog does not
        // hold never becomes a route the shell agrees to open.
        assertNull(Routes.appTabOf("/"))
        assertNull(Routes.appTabOf("/?tab=alerts"))
        assertNull(Routes.appTabOf("/?tab=/not-an-app"))
        assertNull(Routes.appTabOf("/community?tab=/rates"))
        assertNull(Routes.appTabOf(null))
    }

    @Test
    fun `up from a sub-route is its nearest real parent`() {
        assertEquals("/community", Routes.parentOf("/community/post"))
        assertEquals("/community/post", Routes.parentOf("/community/post/replies"))
        assertEquals("/account", Routes.parentOf("/account/posts"))
        assertEquals("/", Routes.parentOf("/"))
    }

    @Test
    fun `a layout-only folder is stepped over`() {
        // `/auth` is a layout, `/consultation` the folder above `/consultation/book`,
        // `/u` a wrapper with no page of its own.
        assertEquals("/", Routes.parentOf("/auth/callback"))
        assertEquals("/", Routes.parentOf("/u/someone"))
        assertEquals("/", Routes.parentOf("/mcp/guide"))
        assertEquals("/", Routes.parentOf("/training/apply"))
    }

    @Test
    fun `a dynamic layout-only folder matches one segment`() {
        // `/admin/certificates/[id]` holds children; its own parent is the list page.
        assertEquals("/admin/certificates", Routes.parentOf("/admin/certificates/abc123"))
        assertEquals("/admin", Routes.parentOf("/admin/certificates"))
    }

    @Test
    fun `an app link becomes a route on our own origin`() {
        assertEquals("/", DeepLink.targetOf("https://royaraqamia.com"))
        assertEquals("/community", DeepLink.targetOf("https://royaraqamia.com/community"))
        assertEquals(
            "/auth/callback?code=abc&state=xyz",
            DeepLink.targetOf("https://royaraqamia.com/auth/callback?code=abc&state=xyz"),
        )
    }

    @Test
    fun `the provider return keeps the segment the scheme hides in the authority`() {
        assertEquals("/auth/callback", DeepLink.targetOf("royar://auth/callback"))
        assertEquals(
            "/auth/callback?code=abc",
            DeepLink.targetOf("royar://auth/callback?code=abc"),
        )
    }

    @Test
    fun `a link that is not ours is refused rather than guessed`() {
        assertNull(DeepLink.targetOf("https://evil.example/account"))
        assertNull(DeepLink.targetOf("http://royaraqamia.com/account"))
        assertNull(DeepLink.targetOf("royar://evil.example/account"))
        assertNull(DeepLink.targetOf("intent://scan/#Intent;end"))
        assertNull(DeepLink.targetOf(""))
        assertNull(DeepLink.targetOf(null))
    }

    @Test
    fun `a web surface is opened on the origin the app links to`() {
        assertEquals("https://royaraqamia.com/account", DeepLink.webUrl("/account"))
        assertEquals("https://royaraqamia.com/", DeepLink.webUrl("/"))
    }
}
