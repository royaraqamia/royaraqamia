package com.royaraqamia.app.store.linksnap

import com.royaraqamia.app.session.KeystoreTokenCipher
import com.royaraqamia.app.session.TokenCipher

/**
 * Seals a link's password before it is queued (#921).
 *
 * The Outbox is a plain SQLite file, so the one secret a LinkSnap write can carry
 * is sealed before it is written there. The app's adapter is
 * [KeystoreLinkPasswordCipher], an AndroidKeyStore AES-GCM key that never leaves
 * the device; a JVM test passes a reversible fake, because there is no Keystore in
 * a unit test.
 *
 * Both calls are allowed to throw, and neither is swallowed:
 *
 * - [seal] throws when the platform will not give the app a key (a locked device,
 *   a Keystore that refuses). The write fails with a sentence instead of storing
 *   a credential in the clear.
 * - [open] throws when the key that sealed the queued write is gone (a device-lock
 *   change invalidated it, a restore to another phone). The drain fails the intent
 *   permanently rather than sending ciphertext as if it were the password.
 */
interface LinkPasswordCipher {
    /** The ciphertext for [password], safe to write to the Outbox. */
    fun seal(password: String): String

    /** The password inside [sealed]. Throws when this build cannot open it. */
    fun open(sealed: String): String
}

/**
 * The Keystore adapter: AES-256-GCM under a non-exportable key with LinkSnap's
 * own alias.
 *
 * The platform mechanics are [KeystoreTokenCipher]'s — one provider, an IV per
 * seal, the key generated on first use and never exported — so the crypto is not
 * written twice. The alias is deliberately not the session's: rotating one key
 * cannot open the other's blobs.
 */
class KeystoreLinkPasswordCipher(
    private val delegate: TokenCipher = KeystoreTokenCipher(alias = KEY_ALIAS),
) : LinkPasswordCipher {
    override fun seal(password: String): String = delegate.seal(password)

    override fun open(sealed: String): String = delegate.open(sealed)

    companion object {
        /** A separate key from the session's refresh token. */
        const val KEY_ALIAS = "rr-linksnap-link-password"
    }
}

/** A password the device's Keystore would not seal, so the write was not queued. */
class LinkPasswordUnavailable(message: String, cause: Throwable? = null) :
    IllegalStateException(message, cause)

/**
 * The queued form of a password (#921): the Outbox row carries ciphertext, never
 * the visitor's secret.
 *
 * The prefix marks the value as this app's sealed form. A payload written before
 * this change carried the plaintext, and [open] sends it as it is rather than
 * mistaking it for ciphertext with an older key.
 */
internal object LinkPasswords {
    private const val PREFIX = "sealed:v1:"

    fun seal(cipher: LinkPasswordCipher, password: String): String =
        PREFIX + cipher.seal(password)

    fun isSealed(value: String): Boolean = value.startsWith(PREFIX)

    /** The password behind [value], opening it when it is a sealed one. */
    fun open(cipher: LinkPasswordCipher, value: String): String =
        if (isSealed(value)) cipher.open(value.removePrefix(PREFIX)) else value
}
