/*
 * Copyright (C) 2026 royaraqamia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package dev.patrickgold.florisboard.ime.rewrite

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator

/**
 * The IME's rewrite-only credential, encrypted with a key that never leaves the
 * Android Keystore (ADR-0220 decision 5).
 *
 * The app and the IME are the same application id and Linux UID but different
 * processes, so they share this app-private file and the same Keystore key. The
 * value is the narrow HMAC claim minted from a signed-in web session — never a
 * Supabase session cookie or refresh token. The file is read fresh on every tap
 * rather than through SharedPreferences, whose per-process cache could keep a
 * revoked token alive after sign-out.
 */
object RewriteCredentialStore {
    private const val FILE = "roy_rewrite_credential.bin"
    private const val ALIAS = "roy_rewrite_credential_key"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"

    @JvmStatic
    fun store(context: Context, token: String): Boolean = try {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        context.openFileOutput(FILE, Context.MODE_PRIVATE).use { it.write(cipher.doFinal(token.toByteArray(Charsets.UTF_8))) }
        true
    } catch (error: Exception) {
        false
    }

    /** The credential, or null when consent was never given or was revoked. */
    @JvmStatic
    fun read(context: Context): String? {
        return try {
            val file = context.getFileStreamPath(FILE)
            if (!file.exists()) null else {
                val bytes = context.openFileInput(FILE).use { it.readBytes() }
                // Android's GCM Cipher carries the IV in front of the
                // ciphertext, so decryption needs only the Keystore key and
                // the bytes as written.
                val cipher = Cipher.getInstance(TRANSFORMATION)
                cipher.init(Cipher.DECRYPT_MODE, key())
                String(cipher.doFinal(bytes), Charsets.UTF_8)
            }
        } catch (error: Exception) {
            null
        }
    }

    @JvmStatic
    fun revoke(context: Context) {
        context.deleteFile(FILE)
        try {
            KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.deleteEntry(ALIAS)
        } catch (error: Exception) {
            // The token is already gone; an undeletable Keystore entry cannot
            // decrypt a file that no longer exists.
        }
    }

    @JvmStatic
    fun enabled(context: Context): Boolean = read(context) != null

    private fun key() = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }.let { store ->
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey ?: generate(store)
    }

    private fun generate(store: KeyStore) = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        .apply {
            init(
                KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
                )
        }
        .generateKey()
        .also { store.getEntry(ALIAS, null) }
}
