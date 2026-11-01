package com.royaraqamia.app

import android.content.Context
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.plans.UsageRepository
import com.royaraqamia.app.preferences.HiddenServicesRepository
import com.royaraqamia.app.session.EncryptedTokenStore
import com.royaraqamia.app.session.KeystoreTokenCipher
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.SharedPreferencesStorage
import com.royaraqamia.app.session.SignInOutcome
import com.royaraqamia.app.session.SupabasePasswordGrant
import com.royaraqamia.app.session.SupabaseTokenRefresher
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.PreferencesIdentityStorage
import com.royaraqamia.app.store.habitflow.HabitDatabase
import com.royaraqamia.app.store.habitflow.HabitStores
import com.royaraqamia.app.store.habitflow.HabitflowRepository
import com.royaraqamia.app.store.habitflow.DrainReport

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
 * session on top of it, the one HTTP client, the Local Store, and the
 * repository a screen asks — so a screen never learns a URL, a key, a file name
 * or how a token is kept.
 */
class AppGraph private constructor(
    val session: Session,
    val usage: UsageRepository,
    val connectedApps: ConnectedAppsRepository,
    val hiddenServices: HiddenServicesRepository,
    val habitflow: HabitflowRepository,
    private val databases: IdentityScopedStore<HabitStores>,
    private val grant: SupabasePasswordGrant,
) {
    /** Whether a request can be sent right now, without waiting on a refresh. */
    val signedIn: Boolean
        get() = session.signedIn

    /**
     * The launch path: a stored refresh token is a session that survived the
     * process, so this is what makes "reopen and still signed in" true.
     *
     * It is deliberately *only* the session. Draining the Outbox on this path is
     * the caller's next step (`drainOutbox`), so a queue left by a long offline
     * stretch cannot delay the first frame that says who is signed in (#650).
     */
    suspend fun start(): Boolean = session.start()

    /** One drain of the HabitFlow queue, for a launch or a radio that came back (#650). */
    suspend fun drainOutbox(): DrainReport = habitflow.drain()

    /** Signs in with a password grant, and holds the pair it mints. */
    suspend fun signIn(email: String, password: String): SignInOutcome {
        val outcome = grant.signIn(email, password)
        if (outcome is SignInOutcome.SignedIn) session.signIn(outcome.pair)
        return outcome
    }

    /**
     * Ends the session and closes the store it was reading (#768).
     *
     * The close is not optional here: the next identity's first read opens its
     * own database, and a connection left open under the previous account is the
     * one way a row could be painted for the wrong person.
     */
    suspend fun signOut() {
        session.signOut()
        databases.close()
    }

    /**
     * Releases the store connection this graph opened, and nothing else (#651).
     *
     * A worker's graph is built for one run: without this, every background
     * drain would leave a database open for the life of the process. The session
     * is deliberately untouched — closing a handle is not signing out.
     */
    fun close() {
        databases.close()
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
            val session =
                Session(
                    store = store,
                    refresher = SupabaseTokenRefresher(authUrl, anonKey),
                    identities = PreferencesIdentityStorage(context),
                )
            val client = ApiClient(siteUrl, session)

            // One database per identity, opened on first use and closed when the
            // identity changes (ADR-0027, #768). The name is the web's, so a
            // device dump reads the same on both clients.
            val databases = IdentityScopedStore { identity -> HabitStores.open(context, identity) }

            return AppGraph(
                session = session,
                usage = UsageRepository(client),
                connectedApps = ConnectedAppsRepository(client),
                hiddenServices = HiddenServicesRepository(client),
                habitflow =
                    HabitflowRepository(
                        databases = databases,
                        identity = { session.storeIdentity },
                        client = client,
                        // A guest's queue waits for a sign-in rather than being
                        // sent as nobody (ADR-0027), and a drain with the radio
                        // off is a drain that spends an attempt learning what the
                        // platform already knows (#650).
                        signedIn = { session.signedIn },
                        online = { Connectivity.isOnline(context) },
                    ),
                databases = databases,
                grant = SupabasePasswordGrant(authUrl, anonKey),
            )
        }
    }
}
