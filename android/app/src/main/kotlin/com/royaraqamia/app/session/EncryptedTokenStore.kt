package com.royaraqamia.app.session

/**
 * A key-value slot the encrypted store can keep its blob in. The app's adapter is
 * `SharedPreferencesStorage`; a test passes a map.
 */
interface KeyValueStorage {
    fun read(key: String): String?
    fun write(key: String, value: String)
    fun remove(key: String)
}

/** Seals and opens one string. The app's adapter is `KeystoreTokenCipher`. */
interface TokenCipher {
    /** The ciphertext for [plainToken], safe to write to storage. */
    fun seal(plainToken: String): String

    /** The token inside [sealedToken]. Throws when this build cannot open it. */
    fun open(sealedToken: String): String
}

/**
 * The refresh token, sealed before it is stored (#501).
 *
 * "No token lands in plain-text storage" is the acceptance criterion, and it is a
 * property of this class rather than of the caller: [write] seals first and
 * [read] can only return what a matching key opened. What sits in storage is
 * base64 ciphertext with the IV in front of it, so a dump of the preferences
 * file yields nothing to replay.
 *
 * A blob this build cannot open — the Keystore key was invalidated (a device
 * lock change, a restore to another phone), a rotation, a hand-edited file — is
 * treated as *no session* rather than as an error to surface: the user signs in
 * again, and the unreadable blob is discarded so the next write starts clean.
 * Throwing here would turn a lost key into a crash on launch, which is the one
 * place a user can do nothing about it.
 */
class EncryptedTokenStore(
    private val storage: KeyValueStorage,
    private val cipher: TokenCipher,
    private val key: String = REFRESH_TOKEN_KEY,
) : TokenStore {
    override fun read(): String? {
        val sealed = storage.read(key) ?: return null
        return try {
            cipher.open(sealed).takeIf { it.isNotEmpty() }
        } catch (_: Exception) {
            clear()
            null
        }
    }

    override fun write(refreshToken: String) {
        storage.write(key, cipher.seal(refreshToken))
    }

    override fun clear() {
        storage.remove(key)
    }

    companion object {
        /** Namespaced like the site's device keys, so a dump is identifiable. */
        const val REFRESH_TOKEN_KEY = "rr:session:refresh:v1"
    }
}
