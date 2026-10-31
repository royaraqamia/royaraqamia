package com.royaraqamia.app.store

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test


/**
 * One store per identity, and a change of identity closes the old one (#768).
 *
 * The failure these tests hold is the one a user would never see as an error:
 * a row painted from the account that signed out, behind the account that just
 * signed in. The store is the only thing that could answer from it, so the
 * contract is "the previous store is closed before the next read happens".
 */
class IdentityScopedStoreTest {
    private class FakeStore(val identity: Identity) : AutoCloseable {
        var closed = false

        override fun close() {
            closed = true
        }
    }

    private val alice = Identity.User("alice")
    private val bob = Identity.User("bob")

    private fun store(): Pair<IdentityScopedStore<FakeStore>, List<FakeStore>> {
        val opened = mutableListOf<FakeStore>()
        val store = IdentityScopedStore { identity -> FakeStore(identity).also { opened.add(it) } }
        return store to opened
    }

    @Test
    fun `the same identity reuses the open store`() {
        val (store, opened) = store()

        val first = store.forIdentity(alice)
        val second = store.forIdentity(alice)

        assertSame("a second read opens nothing", first, second)
        assertEquals(1, opened.size)
    }

    @Test
    fun `a different identity closes the old store first`() {
        val (store, opened) = store()

        store.forIdentity(alice)
        val forBob = store.forIdentity(bob)

        assertTrue("the signed-out account's store is closed", opened.first().closed)
        assertFalse("the current one is open", forBob.closed)
        assertEquals(bob, forBob.identity)
        assertEquals("two identities, two stores", 2, opened.size)
    }

    @Test
    fun `returning to an identity opens it again rather than resurrecting it`() {
        val (store, opened) = store()

        store.forIdentity(alice)
        store.forIdentity(bob)
        val back = store.forIdentity(alice)

        assertEquals("a closed store is not reused", 3, opened.size)
        assertEquals(alice, back.identity)
        assertFalse(back.closed)
    }

    @Test
    fun `closing releases the store and leaves nothing open`() {
        val (store, opened) = store()

        store.forIdentity(alice)
        store.close()

        assertTrue(opened.single().closed)
        assertEquals(null, store.openIdentity)

        // Closing twice is not an error: a sign-out path and a process teardown
        // can both reach it.
        store.close()
        assertTrue(opened.single().closed)
    }

    @Test
    fun `the guest namespace is a partition like any other`() {
        val (store, opened) = store()

        store.forIdentity(Identity.Guest)
        store.forIdentity(alice)

        assertTrue(opened.first().closed)
        assertEquals(alice, store.openIdentity)
    }
}
