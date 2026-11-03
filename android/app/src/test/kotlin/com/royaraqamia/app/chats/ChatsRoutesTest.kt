package com.royaraqamia.app.chats

import com.royaraqamia.app.shell.NativeSurfaces
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The chats routes, as the shell reads them (#819).
 *
 * `/chats/<id>` is the site's thread route; `/chats/new` is the site's
 * new-conversation screen, which the app opens as the document, and the list has
 * no route of its own — the notification centre's chats tab is what opens it.
 * The surface is a port that is switched off (ADR-0117), so the shell hands every
 * one of them to the document today.
 */
class ChatsRoutesTest {
    @Test
    fun `a thread's id is read out of its route`() {
        assertEquals("c-1", ChatRoutes.idOf("/chats/c-1"))
        assertEquals("c-1", ChatRoutes.idOf("/chats/c-1/"))
        assertEquals("c-1", ChatRoutes.idOf("/chats/c-1?from=list#top"))
        assertEquals("/chats/c-1", ChatRoutes.threadOf("c-1"))
        assertTrue(ChatRoutes.matches("/chats/c-1"))
    }

    @Test
    fun `the new-conversation screen and deeper paths are not threads`() {
        assertNull(ChatRoutes.idOf("/chats/new"))
        assertNull(ChatRoutes.idOf("/chats"))
        assertNull(ChatRoutes.idOf("/chats/a/b"))
        assertNull(ChatRoutes.idOf("/notifications?tab=chats"))
        assertFalse(ChatRoutes.matches("/chats/new"))
    }

    @Test
    fun `the list is the notification centre's chats tab`() {
        assertTrue(ChatRoutes.isChatsTab("/notifications?tab=chats"))
        assertFalse(ChatRoutes.isChatsTab("/notifications"))
        assertFalse(ChatRoutes.isChatsTab("/chats/c-1"))
    }

    @Test
    fun `the surface is ported and switched off, and its routes are not public`() {
        // #872 + ADR-0117: the screens exist and the shell hands the route to the
        // document until the port is the same screen as the page.
        assertFalse(NativeSurfaces.isNative("/chats/c-1"))
        assertFalse(NativeSurfaces.isNative("/notifications?tab=chats"))
        assertFalse(NativeSurfaces.isPublic("/chats/c-1"))
    }
}
