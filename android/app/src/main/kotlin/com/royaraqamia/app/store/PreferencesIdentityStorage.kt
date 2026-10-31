package com.royaraqamia.app.store

import android.content.Context
import com.royaraqamia.app.session.SharedPreferencesStorage

/**
 * The persisted identity, in its own private preferences file (#768).
 *
 * Not the session's file: that one holds a sealed refresh token, and mixing a
 * pointer that is not a credential into it would make the two impossible to
 * reason about separately (a wipe of one is not a wipe of the other).
 *
 * One string, written on every successful session resolve, which is what keeps
 * a stale value's lifetime to one failed check rather than forever.
 */
class PreferencesIdentityStorage(
    context: Context,
    file: String = PREFERENCES_FILE,
) : IdentityStorage {
    private val storage = SharedPreferencesStorage(context, file)

    override fun read(): Identity? = Identity.parse(storage.read(KEY))

    override fun write(identity: Identity) {
        storage.write(KEY, identity.key)
    }

    override fun clear() {
        storage.remove(KEY)
    }

    companion object {
        const val PREFERENCES_FILE = "rr-identity"

        /** The key the web uses in `localStorage`, so a reader finds the same name. */
        const val KEY = "royaraqamia:local-identity"
    }
}
