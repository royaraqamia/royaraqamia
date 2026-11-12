package com.royaraqamia.app

import android.content.Context
import com.royaraqamia.app.account.AccountProfileRepository
import com.royaraqamia.app.account.AccountUsageRepository
import com.royaraqamia.app.account.BlockedMembersRepository
import com.royaraqamia.app.account.TransportAvatarLoader
import com.royaraqamia.app.accountnews.NewsRepository
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.assistant.AssistantTurnStore
import com.royaraqamia.app.chats.ChatHintSource
import com.royaraqamia.app.chats.ChatPresenceSource
import com.royaraqamia.app.chats.ChatsRepository
import com.royaraqamia.app.chats.RealtimeChatHints
import com.royaraqamia.app.chats.RealtimeChatPresence
import com.royaraqamia.app.chats.SupabaseChatAttachmentStorage
import com.royaraqamia.app.community.CommunityComposerRepository
import com.royaraqamia.app.community.CommunityEditorRepository
import com.royaraqamia.app.community.CommunityFeedRepository
import com.royaraqamia.app.community.CommunityPostRepository
import com.royaraqamia.app.consultation.ConsultationRepository
import com.royaraqamia.app.connectedapps.ConnectedAppsRepository
import com.royaraqamia.app.home.HomeServicesRepository
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.news.NewsDigestRepository
import com.royaraqamia.app.notifications.NotificationsRepository
import com.royaraqamia.app.plans.UsageRepository
import com.royaraqamia.app.profile.ProfileRepository
import com.royaraqamia.app.quran.AssetQuranRepository
import com.royaraqamia.app.quran.PreferencesQuranPositionStore
import com.royaraqamia.app.quran.QuranRepository
import com.royaraqamia.app.rates.RatesRepository
import com.royaraqamia.app.realtime.RealtimeClient
import com.royaraqamia.app.realtime.RealtimeSession
import com.royaraqamia.app.realtime.RealtimeToken
import com.royaraqamia.app.session.AndroidDocumentCookies
import com.royaraqamia.app.session.DocumentForeground
import com.royaraqamia.app.session.DocumentSessionCookie
import com.royaraqamia.app.session.EncryptedTokenStore
import com.royaraqamia.app.session.KeystoreTokenCipher
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.SharedPreferencesStorage
import com.royaraqamia.app.session.SignInOutcome
import com.royaraqamia.app.session.SupabasePasswordGrant
import com.royaraqamia.app.session.SupabaseTokenRefresher
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.PublicSnapshotStore
import com.royaraqamia.app.store.PreferencesIdentityStorage
import com.royaraqamia.app.store.blogpress.BlogpressRepository
import com.royaraqamia.app.store.blogpress.BlogpressStores
import com.royaraqamia.app.store.chats.ChatsStores
import com.royaraqamia.app.store.habitflow.HabitDatabase
import com.royaraqamia.app.store.habitflow.HabitStores
import com.royaraqamia.app.store.habitflow.HabitflowRepository
import com.royaraqamia.app.store.leads.LeadsRepository
import com.royaraqamia.app.store.leads.LeadsStores
import com.royaraqamia.app.store.linksnap.KeystoreLinkPasswordCipher
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.store.linksnap.LinksnapStores
import com.royaraqamia.app.store.outbox.DrainReport
import com.royaraqamia.app.store.spendtrack.SpendtrackRepository
import com.royaraqamia.app.store.spendtrack.SpendtrackStores
import com.royaraqamia.app.verify.VerifyRepository
import java.io.File
import java.net.URLEncoder

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
 * session on top of it, the one HTTP client, each product's Local Store, and the
 * repository a screen asks — so a screen never learns a URL, a key, a file name
 * or how a token is kept.
 *
 * **One queue per product, one drain for the app** (#653): HabitFlow and
 * SpendTrack each own their rows and their Outbox in their own file, and every
 * path that delivers a queued write — the launch, a reconnection, the worker
 * (#651) — goes through [drainOutbox] rather than naming a product. A second
 * product therefore cannot be added with a queue nothing drains.
 */
class AppGraph private constructor(
    val session: Session,
    val usage: UsageRepository,
    val connectedApps: ConnectedAppsRepository,
    /** The account's blocked members (#977): the list and the unblock. */
    val blockedMembers: BlockedMembersRepository,
    /** The account profile's two writes and its avatar read (#945). */
    val accountProfile: AccountProfileRepository,
    /** The account allowance card's one read (#947). */
    val accountUsage: AccountUsageRepository,
    /** The account news page (#950): the checklist, private feeds and proposals. */
    val news: NewsRepository,
    /** The `/news` digest and the last one this device saw (#926). */
    val newsDigest: NewsDigestRepository,
    /** The bell's number (#659), from the route the site's bell reads. */
    val notifications: NotificationsRepository,
    /** The certificate check (#658): the one route a visitor can call with no session. */
    val verify: VerifyRepository,
    /** The rates board, and the last one this device read (#658). */
    val rates: RatesRepository,
    /** The community feed, and the last page this device saw (#658). */
    val community: CommunityFeedRepository,
    /** One published community post, read from the route the page serves (#922). */
    val communityPost: CommunityPostRepository,
    /** One public member profile, read from the route the page serves (#927). */
    val profile: ProfileRepository,
    /** The community editor over BlogPress's device store (#925). */
    val communityEditor: CommunityEditorRepository,
    /** The community composer's create-and-publish write (#924). */
    val communityComposer: CommunityComposerRepository,
    /** The chats surface (#819): the tab rows, one thread and its writes. */
    val chats: ChatsRepository,
    /** The assistant's turns, owned above the sheet so a closed panel keeps them (ADR-0173). */
    val assistantTurns: AssistantTurnStore,
    /** The app's one Realtime client (ADR-0060, ADR-0141). */
    val realtime: RealtimeClient,
    /** The open thread's hint channels, on that one client. */
    val chatHints: ChatHintSource,
    /** Typing and recording, on the same socket (ADR-0165). */
    val chatPresence: ChatPresenceSource,
    val habitflow: HabitflowRepository,
    /** SpendTrack's store and queue (#653). */
    val spendtrack: SpendtrackRepository,
    /** LinkSnap's store and queue (#654). */
    val linksnap: LinksnapRepository,
    /** BlogPress's store and queue (#952). */
    val blogpress: BlogpressRepository,
    /** The lead forms' queue (#929): anonymous, so one store for the device. */
    val leads: LeadsRepository,
    /** Consultation booking (#930): live reads and one never-queued write. */
    val consultation: ConsultationRepository,
    /** The Quran reader's vendored text and the reader's last place (#955). */
    val quran: QuranRepository,
    /** The homepage's app set (#1194): the picker's read and replace. */
    val homeServices: HomeServicesRepository,
    private val databases: IdentityScopedStore<HabitStores>,
    private val spendtrackDatabases: IdentityScopedStore<SpendtrackStores>,
    private val linksnapDatabases: IdentityScopedStore<LinksnapStores>,
    private val blogpressDatabases: IdentityScopedStore<BlogpressStores>,
    private val chatsDatabases: IdentityScopedStore<ChatsStores>,
    private val leadStores: LeadsStores,
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

    /**
     * Adopts the document's session, or notices that the page signed out (#1194).
     *
     * The site is what signs in, so this is what makes a member who signed in on
     * the phone a member in the app: the shell calls it whenever it comes back to
     * the front, and the API client's refresh calls it before it spends a token.
     */
    suspend fun syncDocumentSession(): Boolean = session.syncFromDocument()

    /**
     * One drain of every product's queue, for a launch or a radio that came back
     * (#650, #653).
     *
     * The reports are summed rather than returned per product: the caller is the
     * worker's decision and the pill, and both ask the same two questions — is
     * anything still owed, and did the server refuse something — which a total
     * answers without the caller learning which product owes it.
     */
    suspend fun drainOutbox(): DrainReport {
        // The lead queue is anonymous, so it drains with no session at all; the
        // owned products' queues wait for one (ADR-0027). Returning the lead
        // report here also keeps a guest's launch from opening four databases
        // that have nothing to send.
        val lead = leads.drain()
        if (!signedIn) return lead

        val habit = habitflow.drain()
        val spend = spendtrack.drain()
        val links = linksnap.drain()
        val posts = blogpress.drain()
        val chatLines = chats.drain()
        return DrainReport(
            replayed = habit.replayed + spend.replayed + links.replayed + posts.replayed + chatLines.replayed + lead.replayed,
            pending = habit.pending + spend.pending + links.pending + posts.pending + chatLines.pending + lead.pending,
            failed = habit.failed + spend.failed + links.failed + posts.failed + chatLines.failed + lead.failed,
        )
    }

    /** What the device owes, product by product, without sending anything (#651). */
    suspend fun outboxStatus(): DrainReport {
        val habit = habitflow.outboxStatus()
        val spend = spendtrack.outboxStatus()
        val links = linksnap.outboxStatus()
        val posts = blogpress.outboxStatus()
        val chatLines = chats.outboxStatus()
        val lead = leads.outboxStatus()
        return DrainReport(
            replayed = 0,
            pending = habit.pending + spend.pending + links.pending + posts.pending + chatLines.pending + lead.pending,
            failed = habit.failed + spend.failed + links.failed + posts.failed + chatLines.failed + lead.failed,
        )
    }

    /** Signs in with a password grant, and holds the pair it mints. */
    suspend fun signIn(email: String, password: String): SignInOutcome {
        val outcome = grant.signIn(email, password)
        if (outcome is SignInOutcome.SignedIn) session.signIn(outcome.pair)
        return outcome
    }

    /**
     * Ends the session and closes the stores it was reading (#768, #653).
     *
     * The close is not optional here: the next identity's first read opens its
     * own databases, and a connection left open under the previous account is the
     * one way a row could be painted for the wrong person.
     */
    suspend fun signOut() {
        session.signOut()
        databases.close()
        spendtrackDatabases.close()
        linksnapDatabases.close()
        blogpressDatabases.close()
        chatsDatabases.close()
        // The lead queue is anonymous and belongs to the device, so it survives
        // a sign-out the way the web's guest store does (#929).
    }

    /**
     * Releases the store connections this graph opened, and nothing else (#651).
     *
     * A worker's graph is built for one run: without this, every background
     * drain would leave a database open for the life of the process. The session
     * is deliberately untouched — closing a handle is not signing out.
     */
    fun close() {
        // A worker's graph holds no subscriptions, so this only releases the
        // socket if a caller happened to open one. The UI graph is not closed
        // here; the thread's own subscription is what closes its socket.
        realtime.close()
        databases.close()
        spendtrackDatabases.close()
        linksnapDatabases.close()
        blogpressDatabases.close()
        chatsDatabases.close()
        leadStores.close()
    }

    companion object {
        /**
         * @param siteUrl the site's origin (`https://royaraqamia.com`), where the
         *   owned routes live.
         * @param authUrl the project's auth base (`https://<ref>.supabase.co/auth/v1`).
         * @param anonKey the project's publishable key. Public by design: it names
         *   the project, and RLS — not this key — decides what a token may read.
         */
        fun create(context: Context, siteUrl: String, authUrl: String, anonKey: String): AppGraph {
            val store = EncryptedTokenStore(SharedPreferencesStorage(context), KeystoreTokenCipher())
            // The one session both clients hold (#1194): the site's
            // `@supabase/ssr` cookie, read on every return and written back after
            // every rotation the app performs. `DocumentForeground` is what keeps
            // the app from rotating the chain while the page is the one using it.
            val documentCookies =
                AndroidDocumentCookies(
                    origin = siteUrl,
                    storageKey = DocumentSessionCookie.storageKey(authUrl),
                )
            val session =
                Session(
                    store = store,
                    refresher = SupabaseTokenRefresher(authUrl, anonKey),
                    identities = PreferencesIdentityStorage(context),
                    document = documentCookies,
                    documentVisible = { DocumentForeground.visible() },
                )
            val client = ApiClient(siteUrl, session)

            // The app's one Realtime socket (ADR-0060, ADR-0141). It reads the
            // session's token at every join, so a refresh mid-session is the
            // token the next subscribe carries, and it renews once when a topic
            // is refused. The base is the project's, derived from the auth base
            // the caller already passed, exactly as the storage base below is.
            val realtime =
                RealtimeClient(
                    url = realtimeUrlOf(authUrl, anonKey),
                    session =
                        object : RealtimeSession {
                            override fun token(): RealtimeToken? =
                                session.attempt()?.let {
                                    RealtimeToken(it.accessToken, it.generation)
                                }

                            override suspend fun renew(seenGeneration: Int): Boolean =
                                session.renew(seenGeneration)
                        },
                )
            val chatHints = RealtimeChatHints(realtime)
            val chatPresence = RealtimeChatPresence(realtime)

            // The composer's files go to the same bucket the site writes, on the
            // session the bucket's policy admits (#933). The storage base is the
            // project's, derived from the auth base the caller already passed.
            val storageUrl = authUrl.substringBefore("/auth/v1").trimEnd('/') + "/storage/v1"
            val chatAttachmentStorage =
                SupabaseChatAttachmentStorage(storageUrl, anonKey, session)

            // One snapshot store for every public surface (#928): a surface names
            // its key, so the feed and the rates board cannot overwrite each
            // other and the rule in docs/specs/offline-first.md is one
            // implementation rather than a file per screen.
            val publicSnapshots = PublicSnapshotStore(File(context.filesDir, "public-snapshots"))

            // One database per identity, per product, opened on first use and
            // closed when the identity changes (ADR-0027, #768). The names are
            // the web's, so a device dump reads the same on both clients.
            val databases = IdentityScopedStore { identity -> HabitStores.open(context, identity) }
            val spendtrackDatabases =
                IdentityScopedStore { identity -> SpendtrackStores.open(context, identity) }
            val linksnapDatabases =
                IdentityScopedStore { identity -> LinksnapStores.open(context, identity) }
            val blogpressDatabases =
                IdentityScopedStore { identity -> BlogpressStores.open(context, identity) }
            val chatsDatabases =
                IdentityScopedStore { identity -> ChatsStores.open(context, identity) }
            // Leads are anonymous, so their queue is one file for the device and
            // is not opened per identity nor closed on a sign-out (#929).
            val leadStores = LeadsStores.open(context)

            // A guest's queue waits for a sign-in rather than being sent as
            // nobody (ADR-0027), and a drain with the radio off spends an attempt
            // learning what the platform already knows (#650).
            val signedIn = { session.signedIn }
            val online = { Connectivity.isOnline(context) }

            // BlogPress's store is also the community editor's device store (#925):
            // a community post is a BlogPress post, so the draft, its Outbox intent
            // and the route that carries it are the ones the BlogPress editor uses.
            val blogpress =
                BlogpressRepository(
                    databases = blogpressDatabases,
                    identity = { session.storeIdentity },
                    client = client,
                    signedIn = signedIn,
                    online = online,
                )

            // The composer's retry reads the post back through the same public
            // route the post screen uses (#924), so it is one instance.
            val communityPost = CommunityPostRepository(client)

            val chats =
                ChatsRepository(
                    client = client,
                    databases = chatsDatabases,
                    identity = { session.storeIdentity },
                    signedIn = signedIn,
                    online = online,
                    attachmentStorage = chatAttachmentStorage,
                )

            return AppGraph(
                session = session,
                usage = UsageRepository(client),
                connectedApps = ConnectedAppsRepository(client),
                blockedMembers = BlockedMembersRepository(client),
                accountProfile = AccountProfileRepository(client, TransportAvatarLoader()),
                accountUsage = AccountUsageRepository(client),
                news = NewsRepository(client),
                newsDigest = NewsDigestRepository(client, publicSnapshots),
                notifications = NotificationsRepository(client),
                homeServices = HomeServicesRepository(client),
                verify = VerifyRepository(client),
                rates = RatesRepository(client, publicSnapshots),
                community = CommunityFeedRepository(client, publicSnapshots),
                communityPost = communityPost,
                communityComposer = CommunityComposerRepository(client, communityPost),
                profile = ProfileRepository(client),
                chats = chats,
                assistantTurns = AssistantTurnStore(chats),
                realtime = realtime,
                chatHints = chatHints,
                chatPresence = chatPresence,
                quran =
                    AssetQuranRepository(
                        context = context,
                        positions = PreferencesQuranPositionStore(context),
                    ),
                habitflow =
                    HabitflowRepository(
                        databases = databases,
                        identity = { session.storeIdentity },
                        client = client,
                        signedIn = signedIn,
                        online = online,
                    ),
                spendtrack =
                    SpendtrackRepository(
                        databases = spendtrackDatabases,
                        identity = { session.storeIdentity },
                        client = client,
                        signedIn = signedIn,
                        online = online,
                    ),
                linksnap =
                    LinksnapRepository(
                        databases = linksnapDatabases,
                        identity = { session.storeIdentity },
                        client = client,
                        signedIn = signedIn,
                        online = online,
                        passwordCipher = KeystoreLinkPasswordCipher(),
                    ),
                blogpress = blogpress,
                communityEditor = CommunityEditorRepository(blogpress),
                leads =
                    LeadsRepository(
                        stores = leadStores,
                        client = client,
                        signedIn = signedIn,
                        online = online,
                    ),
                consultation =
                    ConsultationRepository(
                        client = client,
                        online = online,
                    ),
                databases = databases,
                spendtrackDatabases = spendtrackDatabases,
                linksnapDatabases = linksnapDatabases,
                blogpressDatabases = blogpressDatabases,
                chatsDatabases = chatsDatabases,
                leadStores = leadStores,
                grant = SupabasePasswordGrant(authUrl, anonKey),
            )
        }

        /**
         * The project's Realtime socket, from the auth base the app already has.
         *
         * Supabase serves Realtime at `/realtime/v1/websocket` on the same
         * origin as auth, with the publishable key as `apikey` and protocol
         * `vsn=1.0.0` (ADR-0141). Only the scheme changes: `https` becomes `wss`.
         */
        private fun realtimeUrlOf(authUrl: String, anonKey: String): String {
            val origin = authUrl.substringBefore("/auth/v1").trimEnd('/')
            val socket =
                when {
                    origin.startsWith("https://") -> "wss://" + origin.removePrefix("https://")
                    origin.startsWith("http://") -> "ws://" + origin.removePrefix("http://")
                    else -> origin
                }
            return "$socket/realtime/v1/websocket?apikey=" +
                URLEncoder.encode(anonKey, "UTF-8") +
                "&vsn=1.0.0"
        }
    }
}
