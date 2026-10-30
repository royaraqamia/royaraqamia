package com.royaraqamia.app

import android.content.Context
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.plans.UsageRepository
import com.royaraqamia.app.session.EncryptedTokenStore
import com.royaraqamia.app.session.KeystoreTokenCipher
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.SharedPreferencesStorage
import com.royaraqamia.app.session.SignInOutcome
import com.royaraqamia.app.session.SupabasePasswordGrant
import com.royaraqamia.app.session.SupabaseTokenRefresher

/**
 * The app's composition root (#501): the one place that decides which
 * implementation each seam gets.
 *
 * Manual wiring rather than an injection framework, which is phase 0's decision
 * recorded once: the graph is a handful of objects built in one function, and a
 * library that wires them at build time would add a compiler, a build step and a
 * second way to find out what a class depends on before there is anything to
 * justify it.
 *
 * What it builds is the whole read path — Keystore-backed refresh storage, the
 * session on top of it, the one HTTP client, and the repository a screen asks —
 * so a screen never learns a URL, a key or how a token is kept.
 */
class AppGraph private constructor(
    val session: Session,
    val usage: UsageRepository,
    private val grant: SupabasePasswordGrant,
) {
    /** Whether a request can be sent right now, without waiting on a refresh. */
    val signedIn: Boolean
        get() = session.signedIn

    /**
     * The launch path: a stored refresh token is a session that survived the
     * process, so this is what makes "reopen and still signed in" true.
     */
    suspend fun start(): Boolean = session.start()

    /** Signs in with a password grant, and holds the pair it mints. */
    suspend fun signIn(email: String, password: String): SignInOutcome {
        val outcome = grant.signIn(email, password)
        if (outcome is SignInOutcome.SignedIn) session.signIn(outcome.pair)
        return outcome
    }

    suspend fun signOut() {
        session.signOut()
    }

    companion object {
        /**
         * @param siteUrl the site's origin (`https://royaraqamia.com`), where the
         *   owned routes live.
         * @param authUrl the project's auth base (`https://<ref>.supabase.co/auth/v1`).
         * @param anonKey the project's publishable key. Public by design: it names
         *   the project, and RLS — not this key — decides what a token can read.
         */
        fun create(context: Context, siteUrl: String, authUrl: String, anonKey: String): AppGraph {
            val store = EncryptedTokenStore(SharedPreferencesStorage(context), KeystoreTokenCipher())
            val session = Session(store, SupabaseTokenRefresher(authUrl, anonKey))
            val client = ApiClient(siteUrl, session)

            return AppGraph(
                session = session,
                usage = UsageRepository(client),
                grant = SupabasePasswordGrant(authUrl, anonKey),
            )
        }
    }
}
