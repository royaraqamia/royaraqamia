package com.royaraqamia.app.session

import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityStorage
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * A pair as the auth server minted it, and the account it belongs to.
 *
 * `userId` travels with the pair because a sign-in and a refresh are the two
 * moments the app learns whose rows are on this device (#768), and the identity
 * a store opens under comes from the answer that just arrived rather than from a
 * claim the client would have to parse.
 */
data class TokenPair(val accessToken: String, val refreshToken: String, val userId: String)

/**
 * The signed-in state (#501): an access token in memory, a refresh token sealed
 * at rest, and one refresh however many requests ask for it at once.
 *
 * Three rules, each of which exists because of a failure it prevents:
 *
 * 1. **The access token is memory only.** A restart loses it; [start] gets a new
 *    one from the stored refresh token, which is why a kill does not sign the
 *    user out. A copy on disk would only widen the window a lost phone gives an
 *    attacker, and buy nothing the refresh token does not already do.
 * 2. **A refresh is single-flight.** Four screens opening at once after a
 *    rotation each send an expired token, so all four are answered 401 at the
 *    same moment. Refreshing per request would spend four refresh tokens — and
 *    because the server rotates them single-use, three of those would be a
 *    refusal. [renew] takes the generation the request was sent under: whoever
 *    gets the lock first refreshes, everyone else sees a newer generation and is
 *    told to retry with the token that already exists.
 * 3. **A refused refresh signs out; an unanswered one does not.** The server
 *    saying this token is not valid any more is a dead end — keeping it, or
 *    retrying it, is a loop the user cannot escape — so the store is cleared and
 *    the next launch is a sign-in screen. A refresh that never reached an answer
 *    (no radio, a timeout, a 5xx) says nothing about the token, so the session
 *    keeps it and the request simply fails as [com.royaraqamia.app.contracts.ApiError.Network].
 *
 * The session holds no cookie jar and reads no cookie: every request carries the
 * token it was given (ADR-0089).
 *
 * **It also answers "whose rows are these"** (#768): the identity a Local Store
 * opens under, remembered on disk so a launch with the radio off opens the right
 * store before any refresh can answer. That remembered value is what
 * [storeIdentity] returns, and a sign-out forgets it while leaving the rows on
 * disk (ADR-0027).
 */
class Session(
    private val store: TokenStore,
    private val refresher: TokenRefresher,
    private val identities: IdentityStorage,
) {
    /** What a request sends, and the generation it was sent under. */
    data class Attempt(val accessToken: String, val generation: Int)

    private val mutex = Mutex()

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var generation: Int = 0

    @Volatile
    private var identity: Identity? = null

    /**
     * Read once, at construction, so the paint path costs no disk access: a cold
     * launch's first frame asks [storeIdentity], not a preferences file.
     */
    @Volatile
    private var remembered: Identity? = identities.read()

    /** Whether a request can be sent right now, without waiting for a refresh. */
    val signedIn: Boolean
        get() = accessToken != null

    /**
     * Whose rows this device holds: the account the current pair belongs to, or
     * the one last resolved before this process started.
     *
     * A guest is the honest answer when neither is known — the same namespace a
     * first launch writes into (ADR-0027). No lookup, no lock and no network, so
     * a first frame can call it.
     */
    val storeIdentity: Identity
        get() = identity ?: remembered ?: Identity.Guest

    /** The token to send, tagged with the generation a 401 will be judged against. */
    fun attempt(): Attempt? = accessToken?.let { Attempt(it, generation) }

    /** Adopts the pair a sign-in minted, and makes it survive a restart. */
    suspend fun signIn(pair: TokenPair) {
        mutex.withLock { adopt(pair) }
    }

    /**
     * The launch path: a stored refresh token means the user is still signed in,
     * so renew once and answer whether the app opens signed in. No stored token
     * is not a failure — it is a first run.
     */
    suspend fun start(): Boolean = renew(seenGeneration = generation)

    /**
     * Renews the access token unless someone else already did.
     *
     * [seenGeneration] is what [attempt] handed the caller before it sent its
     * request. When another caller has refreshed in the meantime, that generation
     * is stale and this returns `true` without spending the refresh token: the
     * caller only has to read [attempt] again.
     */
    suspend fun renew(seenGeneration: Int): Boolean = mutex.withLock {
        if (generation != seenGeneration && accessToken != null) return true

        val refreshToken = store.read() ?: return false
        when (val outcome = refresher.refresh(refreshToken)) {
            is RefreshOutcome.Renewed -> {
                adopt(outcome.pair)
                true
            }
            // The server said this token is spent. Keeping it would only ask the
            // same question again on the next request.
            RefreshOutcome.Refused -> {
                signOutLocked()
                false
            }
            // The question was never answered. The token may still be good, so a
            // failed refresh on a dead network must not sign anyone out.
            is RefreshOutcome.Unreachable -> false
        }
    }

    /**
     * Drops the session. The rows the account owns stay on the device, unlinked
     * from an identity rather than deleted (ADR-0027); this call is about the
     * token, not the data. The pointer to the namespace goes with it, so a guest
     * session cannot paint the previous account's rows (#768).
     */
    suspend fun signOut() {
        mutex.withLock { signOutLocked() }
    }

    private fun adopt(pair: TokenPair) {
        accessToken = pair.accessToken
        store.write(pair.refreshToken)
        val adopted = Identity.of(pair.userId)
        identity = adopted
        remembered = adopted
        identities.write(adopted)
        generation += 1
    }

    private fun signOutLocked() {
        accessToken = null
        identity = null
        remembered = null
        store.clear()
        identities.clear()
        generation += 1
    }
}
