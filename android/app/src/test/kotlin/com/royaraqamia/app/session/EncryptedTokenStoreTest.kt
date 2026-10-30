package com.royaraqamia.app.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The store half of "no token lands in plain-text storage" (#501).
 *
 * The Keystore itself cannot run on a JVM, so what is pinned here is the rule
 * around it: [EncryptedTokenStore] never writes a token, only what the cipher
 * returned, and a blob this build cannot open is *no session* rather than a
 * crash on launch.
 */
class EncryptedTokenStoreTest {
    private class MapStorage : KeyValueStorage {
        val values = mutableMapOf<String, String>()

        override fun read(key: String): String? = values[key]

        override fun write(key: String, value: String) {
            values[key] = value
        }

        override fun remove(key: String) {
            values.remove(key)
        }
    }

    /** Standing in for the Keystore: reversible, and obviously not the token. */
    private class ReversingCipher : TokenCipher {
        override fun seal(plainToken: String): String = "sealed:" + plainToken.reversed()

        override fun open(sealedToken: String): String {
            require(sealedToken.startsWith("sealed:")) { "not a blob this build wrote" }
            return sealedToken.removePrefix("sealed:").reversed()
        }
    }

    @Test
    fun `the token is not what storage holds`() {
        val storage = MapStorage()
        val store = EncryptedTokenStore(storage, ReversingCipher())

        store.write("refresh-1")

        val stored = checkNotNull(storage.values[EncryptedTokenStore.REFRESH_TOKEN_KEY])
        assertFalse("the token is in storage", stored.contains("refresh-1"))
        assertEquals("refresh-1", store.read())
    }

    @Test
    fun `a blob this build cannot open is no session`() {
        val storage = MapStorage()
        storage.values[EncryptedTokenStore.REFRESH_TOKEN_KEY] = "written by another key"

        val store = EncryptedTokenStore(storage, ReversingCipher())

        assertNull(store.read())
        assertTrue(
            "the unreadable blob is discarded so the next write starts clean",
            storage.values.isEmpty()
        )
    }

    @Test
    fun `clear drops the blob`() {
        val storage = MapStorage()
        val store = EncryptedTokenStore(storage, ReversingCipher())
        store.write("refresh-1")

        store.clear()

        assertNull(storage.values[EncryptedTokenStore.REFRESH_TOKEN_KEY])
        assertNull(store.read())
    }
}
