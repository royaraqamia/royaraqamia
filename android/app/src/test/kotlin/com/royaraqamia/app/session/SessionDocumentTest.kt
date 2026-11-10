package com.royaraqamia.app.session

import com.royaraqamia.app.store.MemoryIdentityStorage
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The half of the session that is shared with the document (#1194).
 *
 * One refresh-token chain, two clients: the cases here are the ones that decide
 * whether a member stays signed in – a launch that adopts instead of spending a
 * token, a page that refreshed while the app was away, a page that is in front
 * and therefore owns the chain, and a sign-out on either side being the other's.
 */
class SessionDocumentTest {
    private class FakeCookies(var session: DocumentSession? = null) : DocumentCookies {
        var writes = 0
        var clears = 0

        override suspend fun read(): DocumentSession? = session

        override suspend fun write(session: DocumentSession) {
            this.session = session
            writes += 1
        }

        override suspend fun clear() {
            session = null
            clears += 1
        }
    }

    private class FixedRefresher(private val outcome: RefreshOutcome) : TokenRefresher {
        var calls = 0

        override suspend fun refresh(refreshToken: String): RefreshOutcome {
            calls += 1
            return outcome
        }
    }

    private fun documentSession(
        access: String = "doc-access",
        refresh: String = "doc-refresh",
        user: String = "user-1",
        expiresAt: Long = 2_000,
    ): DocumentSession =
        DocumentSession(
            raw =
                """{"access_token":"$access","expires_at":$expiresAt,""" +
                    """"refresh_token":"$refresh","user":{"id":"$user"}}""",
            accessToken = access,
            refreshToken = refresh,
            userId = user,
            expiresAt = expiresAt,
        )

    @Test
    fun `a launch adopts the document's session instead of spending a token`() = runBlocking {
        val jar = FakeCookies(documentSession())
        val refresher = FixedRefresher(RefreshOutcome.Unreachable("must not be asked"))
        val store = MemoryTokenStore()
        val identities = MemoryIdentityStorage()

        val session = Session(store, refresher, identities, document = jar)

        assertTrue(session.start())
        assertTrue(session.signedIn)
        assertEquals("doc-access", session.attempt()?.accessToken)
        assertEquals("the chain survives a restart", "doc-refresh", store.read())
        assertEquals("the document's user names the rows", "user:user-1", session.storeIdentity.key)
        assertEquals(0, refresher.calls)
        assertEquals("a session read from the jar is not written back to it", 0, jar.writes)
    }

    @Test
    fun `a session the page rotated wins over the one in memory`() = runBlocking {
        val jar = FakeCookies(documentSession(access = "doc-2", expiresAt = 2_000))
        val refresher = FixedRefresher(RefreshOutcome.Unreachable("must not be asked"))
        val session = Session(MemoryTokenStore(), refresher, MemoryIdentityStorage(), document = jar)
        session.signIn(TokenPair("app-1", "app-refresh", "user-1", expiresAt = 1_000))

        assertTrue(session.syncFromDocument())

        assertEquals("doc-2", session.attempt()?.accessToken)
        assertEquals(0, refresher.calls)
    }

    @Test
    fun `a repeat sync is not a change`() = runBlocking {
        val jar = FakeCookies(documentSession())
        val session = Session(MemoryTokenStore(), FixedRefresher(RefreshOutcome.Refused), MemoryIdentityStorage(), document = jar)
        assertTrue(session.start())
        val generation = checkNotNull(session.attempt()).generation

        assertFalse(session.syncFromDocument())
        assertEquals(generation, session.attempt()?.generation)
    }

    @Test
    fun `the app does not rotate the chain while a page is in front`() = runBlocking {
        val refresher = FixedRefresher(RefreshOutcome.Renewed(TokenPair("app-2", "app-3", "user-1")))
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                refresher,
                MemoryIdentityStorage(),
                document = FakeCookies(null),
                documentVisible = { true },
            )

        assertFalse(session.renew(0))
        assertEquals("the page's token is not spent", 0, refresher.calls)
        assertFalse(session.signedIn)
    }

    @Test
    fun `a rotation the app performed is written into the jar`() = runBlocking {
        val jar = FakeCookies(null)
        val pair = TokenPair("app-2", "app-3", "user-1", expiresAt = 3_000, raw = """{"access_token":"app-2"}""")
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                FixedRefresher(RefreshOutcome.Renewed(pair)),
                MemoryIdentityStorage(),
                document = jar,
            )

        assertTrue(session.renew(0))
        assertEquals(1, jar.writes)
        assertEquals("app-2", jar.session?.accessToken)
        assertEquals("app-3", jar.session?.refreshToken)
        assertEquals(3_000L, jar.session?.expiresAt)
    }

    @Test
    fun `signing out clears the document's jar too`() = runBlocking {
        val jar = FakeCookies(documentSession())
        val session = Session(MemoryTokenStore(), FixedRefresher(RefreshOutcome.Refused), MemoryIdentityStorage(), document = jar)
        assertTrue(session.start())

        session.signOut()

        assertFalse(session.signedIn)
        assertNull(jar.session)
        assertEquals(1, jar.clears)
    }

    @Test
    fun `a page that signed out signs the app out with it`() = runBlocking {
        val jar = FakeCookies(documentSession())
        val session = Session(MemoryTokenStore(), FixedRefresher(RefreshOutcome.Refused), MemoryIdentityStorage(), document = jar)
        assertTrue(session.start())

        jar.session = null

        assertFalse(session.syncFromDocument())
        assertFalse(session.signedIn)
        assertNull(session.attempt())
    }
}
