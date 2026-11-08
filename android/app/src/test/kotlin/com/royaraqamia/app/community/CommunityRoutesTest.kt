package com.royaraqamia.app.community

import com.royaraqamia.app.shell.DeepLink
import com.royaraqamia.app.shell.NativeSurfaces
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two community links, as routes (#658).
 *
 * A post is the site's `/community/<slug>` and the feed hands it to the shell as
 * a route; the shell decides whether to draw it or hand it over. The profile is
 * public too — a guest reads `/u/<username>` — which is why the feed may call it
 * public before its screen exists: a public route the app cannot draw opens the
 * document instead of the sign-in card.
 */
class CommunityRoutesTest {
    @Test
    fun `a post's slug is read out of its route`() {
        assertEquals("first-post", CommunityRoutes.slugOf("/community/first-post"))
        assertEquals("منشور", CommunityRoutes.slugOf("/community/%D9%85%D9%86%D8%B4%D9%88%D8%B1"))
        assertEquals("first-post", CommunityRoutes.slugOf("/community/first-post/"))
        assertEquals("first-post", CommunityRoutes.slugOf("/community/first-post?from=feed#top"))
    }

    @Test
    fun `the feed itself and deeper paths are not posts`() {
        assertNull(CommunityRoutes.slugOf("/community"))
        assertNull(CommunityRoutes.slugOf("/community/"))
        assertNull(CommunityRoutes.slugOf("/community/a/b"))
        assertNull(CommunityRoutes.slugOf("/rates"))
        assertFalse(CommunityRoutes.matches("/community"))
        assertTrue(CommunityRoutes.matches("/community/first-post"))
        assertEquals("/community/first-post", CommunityRoutes.postOf("first-post"))
    }

    @Test
    fun `a link from outside the app resolves to the post's slug`() {
        assertEquals(
            "first-post",
            CommunityRoutes.slugOf(DeepLink.targetOf("https://royaraqamia.com/community/first-post")),
        )
        assertEquals(
            "منشور",
            CommunityRoutes.slugOf(
                DeepLink.targetOf(
                    "https://royaraqamia.com/community/%D9%85%D9%86%D8%B4%D9%88%D8%B1"
                )
            ),
        )
    }

    @Test
    fun `the feed is native, and a post and a profile are public`() {
        // #901 + ADR-0118: the feed's port passed the gate, so the shell draws it.
        // A post is still the document, and a profile is public but not native.
        assertTrue(NativeSurfaces.isNative("/community"))
        assertFalse(NativeSurfaces.isNative("/community/first-post"))

        assertTrue(NativeSurfaces.isPublic("/community"))
        assertTrue(NativeSurfaces.isPublic("/community/first-post"))
        assertTrue(NativeSurfaces.isPublic("/u/ahmad"))
        assertFalse(NativeSurfaces.isPublic("/account/plan"))
    }
}
