package com.royaraqamia.app.account

import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.MemoryIdentityStorage
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What the account screen's sign-out promises (#948, ADR-0027): the identity is
 * forgotten, the rows stay on disk, and the next member opens their own namespace
 * rather than the one that just signed out.
 *
 * The two calls below are what `AppGraph.signOut()` makes for each product store
 * — the session drops its pointer and its token, then the store is closed — so
 * this is the seam the screen's callback reaches, not a second implementation of
 * it. `AccountScreenTest` is the other half: it presses the control that reaches
 * this callback.
 */
class AccountSignOutTest {
    private class RowStore(
        val identity: Identity,
        private val disk: MutableMap<Identity, MutableList<String>>,
    ) : AutoCloseable {
        val rows: MutableList<String> = disk.getOrPut(identity) { mutableListOf() }

        var closed = false

        override fun close() {
            closed = true
        }
    }

    @Test
    fun `signing out keeps the rows and the next member sees none of them`() = runBlocking {
        val identities = MemoryIdentityStorage()
        val tokens = MemoryTokenStore()
        val session =
            Session(
                tokens,
                TokenRefresher { RefreshOutcome.Refused },
                identities,
            )
        val disk = mutableMapOf<Identity, MutableList<String>>()
        val opened = mutableListOf<RowStore>()
        val stores =
            IdentityScopedStore { identity ->
                RowStore(identity, disk).also { opened.add(it) }
            }

        session.signIn(TokenPair("access-1", "refresh-1", "alice-id"))
        stores.forIdentity(session.storeIdentity).rows += "alice-habit"

        // The screen's sign-out control reaches AppGraph.signOut(), which is these
        // two calls: the identity pointer and the open connections, never a delete.
        session.signOut()
        stores.close()

        assertEquals("the previous identity is forgotten", Identity.Guest, session.storeIdentity)
        assertNull("nothing remembered to reopen", identities.read())
        assertNull("the refresh token is emptied", tokens.read())
        assertTrue("the previous store is closed", opened.single().closed)
        assertEquals(
            "the rows are still on disk",
            listOf("alice-habit"),
            disk[Identity.User("alice-id")],
        )

        session.signIn(TokenPair("access-2", "refresh-2", "bob-id"))
        val bob = stores.forIdentity(session.storeIdentity)

        assertEquals(Identity.User("bob-id"), session.storeIdentity)
        assertEquals("the next member starts with no rows", emptyList<String>(), bob.rows)
        assertEquals("alice's rows are still hers", listOf("alice-habit"), disk[Identity.User("alice-id")])
    }
}
