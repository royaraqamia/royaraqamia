package com.royaraqamia.app.session

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The app's two adapters for the session store (#501): a preferences file and the
 * Keystore key that seals what goes in it.
 *
 * Both are thin on purpose. The rules a test can hold — what is stored, when a
 * blob is discarded, when a refresh happens — live in [EncryptedTokenStore] and
 * [Session], which take these interfaces rather than the platform. What is here
 * cannot run on a JVM (there is no Keystore in a unit test), so the honest claim
 * it makes is narrow: AES-256-GCM with a key the platform never exports.
 */

/** The sealed blob's home: one private preferences file, nothing else in it. */
class SharedPreferencesStorage(
    context: Context,
    private val file: String = PREFERENCES_FILE,
) : KeyValueStorage {
    private val preferences = context.applicationContext.getSharedPreferences(file, Context.MODE_PRIVATE)

    override fun read(key: String): String? = preferences.getString(key, null)

    override fun write(key: String, value: String) {
        preferences.edit().putString(key, value).apply()
    }

    override fun remove(key: String) {
        preferences.edit().remove(key).apply()
    }

    companion object {
        const val PREFERENCES_FILE = "rr-session"
    }
}

/**
 * AES-256-GCM under a non-exportable AndroidKeyStore key.
 *
 * The key is generated on first use and never leaves the Keystore: what the app
 * holds is an alias, and a copy of the preferences file on another device opens
 * nothing. The IV is generated per seal by the provider and stored in front of
 * the ciphertext, because GCM must never reuse one.
 *
 * An invalidated key (`KeyPermanentlyInvalidatedException`, or a key that no
 * longer exists after a restore) surfaces as the exception [open] is allowed to
 * throw; [EncryptedTokenStore] turns that into "no session" rather than a crash.
 */
class KeystoreTokenCipher(private val alias: String = KEY_ALIAS) : TokenCipher {
    override fun seal(plainToken: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())

        val sealed = cipher.doFinal(plainToken.toByteArray(Charsets.UTF_8))
        return "${encode(cipher.iv)}:${encode(sealed)}"
    }

    override fun open(sealedToken: String): String {
        val parts = sealedToken.split(':', limit = 2)
        require(parts.size == 2) { "sealed token is not iv:ciphertext" }

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(TAG_BITS, decode(parts[0])))

        return String(cipher.doFinal(decode(parts[1])), Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(KEY_BITS)
                .build()
        )
        return generator.generateKey()
    }

    private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String?): ByteArray {
        require(!value.isNullOrEmpty()) { "sealed token is missing its iv or ciphertext" }
        return Base64.decode(value, Base64.NO_WRAP)
    }

    companion object {
        const val KEY_ALIAS = "rr-session-refresh"
        private const val KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
        private const val KEY_BITS = 256
    }
}
