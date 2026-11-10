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
 *
 * [raw] is the same answer as JSON. It is memory only, and it exists for one
 * caller: the document's cookie jar, which has to receive the whole session the
 * server minted when the app rotates it (#1194).
 */
data class TokenPair(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    /** Unix seconds the access token expires; 0 when the answer did not say. */
    val expiresAt: Long = 0,
    val raw: String? = null,
)

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
 * **It also answers "whose rows are these"** (#768): the identity a Local Store
 * opens under, remembered on disk so a launch with the radio off opens the right
 * store before any refresh can answer. That remembered value is what
 * [storeIdentity] returns, and a sign-out forgets it while leaving the rows on
 * disk (ADR-0027).
 *
 * **And since #1194 it is the same session the document holds.** The site signs
 * in and stores the session in `@supabase/ssr`'s cookie; [syncFromDocument]
 * adopts it, and a rotation the app performs is written back into that jar, so
 * the two clients cannot drift into two sessions. The chain is rotated by
 * exactly one client at a time: [renew] reads the jar first (a newer session
 * there wins, no request spent) and refuses to rotate while a page is in front
 * ([DocumentForeground]).
 */
class Session(
    private val store: TokenStore,
    private val refresher: TokenRefresher,
    private val identities: IdentityStorage,
    private val document: DocumentCookies? = null,
    private val documentVisible: () -> Boolean = { false },
) {
    /** What a request sends, and the generation it was sent under. */
    data class Attempt(val accessToken: String, val generation: Int)

    /** Who minted the session the app holds, which decides what a missing cookie means. */
    private enum class Source {
        None,
        /** A sign-in or refresh the app performed itself (#501). */
        Device,
        /** The session the document's jar held (#1194). */
        Document,
    }

    private val mutex = Mutex()

    @Volatile
    private var accessToken: String? = null

    @Volatile
    private var accessExpiresAt: Long = 0

    @Volatile
    private var generation: Int = 0

    @Volatile
    private var identity: Identity? = null

    @Volatile
    private var source: Source = Source.None

    /**
     * Read once, at construction, so the paint path costs no disk access: a cold
     * launch's first frame asks [storeIdentity], not a preferences file.
     */
    @Volatile
    private var remembered: Identity? = identities.read()

    /** Whether a request can be sent right now, without waiting on a refresh. */
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
        mutex.withLock { adopt(pair, Source.Device) }
    }

    /**
     * The launch path: the document's session if there is one, otherwise a
     * stored refresh token renewed once.
     *
     * The order matters (#1194). The page is what signs in, so a launch that
     * asked the server first would spend a refresh token the page is about to
     * rotate itself; reading the shared jar is free, and it is the same session
     * the member is looking at.
     */
    suspend fun start(): Boolean {
        if (syncFromDocument()) return true
        return renew(seenGeneration = generation)
    }

    /**
     * Reads the document's jar and adopts what is newer than what the app holds.
     *
     * Returns whether the app is signed in afterwards. A jar with no session and
     * a document-sourced session in memory is the page having signed out: the
     * app signs out with it rather than keeping a member the site no longer has.
     */
    suspend fun syncFromDocument(): Boolean = mutex.withLock { syncDocumentLocked() }

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

        // The page may have rotated the chain since the request was sent.
        if (syncDocumentLocked()) return true

        val refreshToken = store.read() ?: return false

        // One chain, one writer at a time: while a page is in front it is the
        // page's turn, and a rotation here would spend the token it is holding.
        if (documentVisible()) return false

        when (val outcome = refresher.refresh(refreshToken)) {
            is RefreshOutcome.Renewed -> {
                adopt(outcome.pair, Source.Device)
                true
            }
            // The server said this token is spent. Keeping it would only ask the
            // same question again on the next request, and the page's copy of the
            // same chain is spent too.
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
     *
     * The document's jar is cleared in the same breath (#1194): a sign-out the
     * app performed has to be the site's sign-out too, or the next
     * [syncFromDocument] would sign the member straight back in.
     */
    suspend fun signOut() {
        mutex.withLock { signOutLocked() }
    }

    /**
     * Adopts a session, from either client. A pair the app minted is written to
     * the jar; a pair read from the jar is not written back to itself.
     */
    private suspend fun adopt(pair: TokenPair, source: Source) {
        accessToken = pair.accessToken
        accessExpiresAt = pair.expiresAt
        this.source = source
        store.write(pair.refreshToken)
        val adopted = Identity.of(pair.userId)
        identity = adopted
        remembered = adopted
        identities.write(adopted)
        generation += 1

        if (source == Source.Device) publish(pair)
    }

    /** Writes a session the app minted into the jar, so the page starts signed in. */
    private suspend fun publish(pair: TokenPair) {
        val raw = pair.raw ?: return
        document?.write(
            DocumentSession(
                raw = raw,
                accessToken = pair.accessToken,
                refreshToken = pair.refreshToken,
                userId = pair.userId,
                expiresAt = pair.expiresAt,
            )
        )
    }

    private suspend fun syncDocumentLocked(): Boolean {
        val jar = document ?: return false
        val stored =
            jar.read() ?: run {
                if (source == Source.Document) signOutLocked()
                return false
            }

        val current = identity
        val differentUser = current != null && current != Identity.of(stored.userId)
        val newer = stored.expiresAt > accessExpiresAt
        if (source != Source.None && !differentUser && !newer) return false

        adopt(
            TokenPair(
                accessToken = stored.accessToken,
                refreshToken = stored.refreshToken,
                userId = stored.userId,
                expiresAt = stored.expiresAt,
                raw = stored.raw,
            ),
            Source.Document,
        )
        return true
    }

    private suspend fun signOutLocked() {
        accessToken = null
        accessExpiresAt = 0
        identity = null
        remembered = null
        source = Source.None
        store.clear()
        identities.clear()
        generation += 1
        document?.clear()
    }
}
