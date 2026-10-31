package com.royaraqamia.app.session

import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.MemoryIdentityStorage
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Whose rows this device holds (#768).
 *
 * The launch case is the one that makes the store worth having: the identity a
 * store opens under has to be known *before* the network answers, because a cold
 * launch with the radio off never gets an answer at all. So it is remembered on
 * disk and read once, at construction — and the sign-out case is the one that
 * makes it safe: forgetting the pointer is what stops the previous account's
 * rows being painted behind a guest.
 */
class SessionIdentityTest {
    private val refresher = TokenRefresher { RefreshOutcome.Refused }

    @Test
    fun `a first launch is a guest`() {
        val session = Session(MemoryTokenStore(), refresher, MemoryIdentityStorage())

        assertEquals(Identity.Guest, session.storeIdentity)
    }

    @Test
    fun `a sign-in names the account and remembers it`() = runBlocking {
        val identities = MemoryIdentityStorage()
        val session = Session(MemoryTokenStore(), refresher, identities)

        session.signIn(TokenPair("access-1", "refresh-1", "alice-id"))

        assertEquals(Identity.User("alice-id"), session.storeIdentity)
        assertEquals("the next launch reads this", Identity.User("alice-id"), identities.read())
    }

    @Test
    fun `a launch with no network paints the remembered account`() {
        val identities = MemoryIdentityStorage(Identity.User("alice-id"))
        val session = Session(MemoryTokenStore("refresh-1"), refresher, identities)

        // Nothing has been asked of the network yet: this is the first frame.
        assertEquals(Identity.User("alice-id"), session.storeIdentity)
        assertFalse(session.signedIn)
    }

    @Test
    fun `a refresh that is never answered keeps the identity it painted with`() = runBlocking {
        val identities = MemoryIdentityStorage(Identity.User("alice-id"))
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Unreachable("no radio") },
                identities,
            )

        assertFalse(session.start())
        assertEquals(Identity.User("alice-id"), session.storeIdentity)
        assertEquals("a tunnel is not a sign-out", Identity.User("alice-id"), identities.read())
    }

    @Test
    fun `a refused refresh forgets the pointer and leaves the rows to no one`() = runBlocking {
        val identities = MemoryIdentityStorage(Identity.User("alice-id"))
        val session = Session(MemoryTokenStore("refresh-1"), refresher, identities)

        assertFalse(session.start())

        assertEquals("the account's rows must not paint behind a guest", Identity.Guest, session.storeIdentity)
        assertNull(identities.read())
    }

    @Test
    fun `a sign-out forgets the pointer without forgetting it twice`() = runBlocking {
        val identities = MemoryIdentityStorage()
        val session = Session(MemoryTokenStore(), refresher, identities)
        session.signIn(TokenPair("access-1", "refresh-1", "alice-id"))

        session.signOut()

        assertEquals(Identity.Guest, session.storeIdentity)
        assertNull(identities.read())
        assertFalse(session.signedIn)
    }

    @Test
    fun `the guest identity is written like any other, so a resolve is remembered`() {
        val identities = MemoryIdentityStorage()
        val session = Session(MemoryTokenStore(), refresher, identities)
        identities.write(Identity.Guest)

        assertEquals("a later construction reads guest, not nothing", Identity.Guest, identities.read())
        assertEquals(Identity.Guest, session.storeIdentity)
    }
}
