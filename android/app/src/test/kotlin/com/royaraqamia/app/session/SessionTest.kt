package com.royaraqamia.app.session

import com.royaraqamia.app.store.MemoryIdentityStorage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * The session's three rules (#501): the access token is memory, a refresh is
 * single-flight, and only a *refusal* ends the session.
 *
 * Every test here is a failure that reached a user of the WebView shell in some
 * form: a signed-out app after an update, a thundering herd of refreshes that
 * spent each other's rotated tokens, and a tunnel that signed people out of the
 * app on the train.
 */
class SessionTest {
    /** Counts how many times the session actually asked for a new pair. */
    private class CountingRefresher(private val outcome: () -> RefreshOutcome) : TokenRefresher {
        val calls = AtomicInteger()

        override suspend fun refresh(refreshToken: String): RefreshOutcome {
            calls.incrementAndGet()
            // Long enough that concurrent callers really overlap; without it a
            // mutex bug is hidden by the first call finishing before the second
            // starts.
            delay(20)
            return outcome()
        }
    }

    @Test
    fun `a stored refresh token signs in after a restart`() = runBlocking {
        val store = MemoryTokenStore("refresh-1")
        val refresher = CountingRefresher { RefreshOutcome.Renewed(TokenPair("access-1", "refresh-2", "user-1")) }

        // A new process: nothing in memory, the sealed token on disk.
        val session = Session(store, refresher, MemoryIdentityStorage())

        assertTrue(session.start())
        assertTrue(session.signedIn)
        assertEquals("access-1", session.attempt()?.accessToken)
        assertEquals("the rotated token is the one kept", "refresh-2", store.read())
    }

    @Test
    fun `no stored token is a first run, not a failure`() = runBlocking {
        val refresher = CountingRefresher { RefreshOutcome.Renewed(TokenPair("access-1", "refresh-2", "user-1")) }
        val session = Session(MemoryTokenStore(), refresher, MemoryIdentityStorage())

        assertFalse(session.start())
        assertFalse(session.signedIn)
        assertEquals("a first run asks the server nothing", 0, refresher.calls.get())
    }

    @Test
    fun `concurrent callers spend one refresh token`() = runBlocking {
        val store = MemoryTokenStore("refresh-1")
        val refresher = CountingRefresher { RefreshOutcome.Renewed(TokenPair("access-1", "refresh-2", "user-1")) }
        val session = Session(store, refresher, MemoryIdentityStorage())
        session.signIn(TokenPair("stale", "refresh-1", "user-1"))

        // Eight requests went out under the same generation and were all answered
        // 401; each asks to renew against the generation it saw.
        val seen = checkNotNull(session.attempt()).generation
        val results =
            (1..8).map { async(Dispatchers.Default) { session.renew(seen) } }.awaitAll()

        assertTrue("every caller is told to retry", results.all { it })
        assertEquals("one refresh, not eight", 1, refresher.calls.get())
        assertEquals("access-1", session.attempt()?.accessToken)
    }

    @Test
    fun `a refused refresh signs out and is never retried`() = runBlocking {
        val store = MemoryTokenStore("refresh-1")
        val refresher = CountingRefresher { RefreshOutcome.Refused }
        val session = Session(store, refresher, MemoryIdentityStorage())

        assertFalse(session.start())
        assertFalse(session.signedIn)
        assertNull("a refused token is not kept", store.read())

        // The next request finds nothing to refresh rather than asking again.
        assertFalse(session.renew(0))
        assertEquals(1, refresher.calls.get())
    }

    @Test
    fun `an unanswered refresh keeps the session`() = runBlocking {
        val store = MemoryTokenStore("refresh-1")
        val refresher = CountingRefresher { RefreshOutcome.Unreachable("no radio") }
        val session = Session(store, refresher, MemoryIdentityStorage())
        session.signIn(TokenPair("access-1", "refresh-1", "user-1"))

        val seen = checkNotNull(session.attempt()).generation
        assertFalse(session.renew(seen))

        // The train went into a tunnel: the token is fine, the network is not.
        assertTrue(session.signedIn)
        assertEquals("access-1", session.attempt()?.accessToken)
        assertEquals("refresh-1", store.read())
    }

    @Test
    fun `signing out drops the token and the access token`() = runBlocking {
        val store = MemoryTokenStore()
        val refresher = CountingRefresher { RefreshOutcome.Refused }
        val session = Session(store, refresher, MemoryIdentityStorage())
        session.signIn(TokenPair("access-1", "refresh-1", "user-1"))

        session.signOut()

        assertFalse(session.signedIn)
        assertNull(session.attempt())
        assertNull(store.read())
    }
}
