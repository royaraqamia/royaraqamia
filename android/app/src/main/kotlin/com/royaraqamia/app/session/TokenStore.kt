package com.royaraqamia.app.session

/**
 * Where the refresh token lives (#501).
 *
 * The access token never touches storage: it is memory, and a restart loses it.
 * That is the point of the pair — an access token is short-lived, and a copy on
 * disk only widens the window a lost device gives an attacker. The refresh token
 * is the long-lived half, so it is the one sealed at rest, and
 * [EncryptedTokenStore] is the only implementation that ships.
 *
 * The interface exists so a test can hold a session without a Keystore, and so
 * the storage can be swapped (a cipher migration, a different platform) without
 * touching the session's rules.
 */
interface TokenStore {
    /** The stored refresh token, or `null` when there is no session. */
    fun read(): String?

    /** Replaces the stored token. Called on every rotation the server hands out. */
    fun write(refreshToken: String)

    /** Drops the stored token: a sign-out, or a refresh the server refused. */
    fun clear()
}

/** A token that lives for the process, for tests and previews. */
class MemoryTokenStore(initial: String? = null) : TokenStore {
    private var value: String? = initial

    override fun read(): String? = value

    override fun write(refreshToken: String) {
        value = refreshToken
    }

    override fun clear() {
        value = null
    }
}
