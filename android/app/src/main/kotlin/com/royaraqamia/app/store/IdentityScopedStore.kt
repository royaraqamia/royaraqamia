package com.royaraqamia.app.store



/**
 * One open store per identity, and a change of identity closes the old one
 * (#768, ADR-0027's "the connection is closed when the identity changes").
 *
 * Two things this exists to prevent, both silent:
 *
 * 1. **A read under the previous identity.** A sign-out and a sign-in swap the
 *    partition; a store opened under the first account and left open would keep
 *    answering from it, and a row painted behind a guest would look like the new
 *    account's data.
 * 2. **An unbounded number of open databases.** Opening a database per query
 *    costs a migration check on every read; opening one per identity and keeping
 *    it costs nothing, because there are two identities in a session's life.
 *
 * It is deliberately not a cache: closing is the only eviction, and it happens
 * when the identity changes rather than on a timer, so nothing an identity owns
 * is dropped while it is still the current one.
 */
class IdentityScopedStore<T : AutoCloseable>(private val open: (Identity) -> T) : AutoCloseable {
    private var current: Entry<T>? = null

    /** The store for [identity], opening it if the open one belongs to someone else. */
    @Synchronized
    fun forIdentity(identity: Identity): T {
        current?.let { entry ->
            if (entry.identity == identity) return entry.store
            release(entry.store)
            current = null
        }
        return open(identity).also { current = Entry(identity, it) }
    }

    /** Which identity is open, for tests and diagnostics; `null` when nothing is. */
    @get:Synchronized
    val openIdentity: Identity?
        get() = current?.identity

    /**
     * Closes the open store. The rows stay on disk — this is a connection, not a
     * delete; a sign-out keeps the account's namespace (ADR-0027).
     */
    @Synchronized
    override fun close() {
        current?.let { release(it.store) }
        current = null
    }

    /**
     * Releases one store. A failure is swallowed on purpose: there is no row
     * left open per command (Room closes its own cursors), the next read opens a
     * fresh database, and a sign-out that threw because a handle was already
     * gone would leave the UI on the previous identity.
     */
    private fun release(store: T) {
        runCatching { store.close() }
    }

    private data class Entry<T>(val identity: Identity, val store: T)
}
