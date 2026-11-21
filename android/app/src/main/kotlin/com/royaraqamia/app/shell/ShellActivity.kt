package com.royaraqamia.app.shell

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.createFontFamilyResolver
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.content.FileProvider
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.royaraqamia.app.AppGraph
import com.royaraqamia.app.assistant.AssistantSheet
import com.royaraqamia.app.assistant.AssistantSnapshot
import com.royaraqamia.app.assistant.PublishedScreen
import com.royaraqamia.app.account.AccountScreen
import com.royaraqamia.app.account.AccountUiState
import com.royaraqamia.app.admin.AdminConsoleRoute
import com.royaraqamia.app.accountnews.NewsScreen
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlinx.coroutines.launch
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.account.AccountFaqScreen
import com.royaraqamia.app.account.BlockedMembersScreen
import com.royaraqamia.app.account.MemoryRepository
import com.royaraqamia.app.account.MemoryScreen
import com.royaraqamia.app.chats.ChatNewScreen
import com.royaraqamia.app.chats.ChatRoutes
import com.royaraqamia.app.chats.ChatThread
import com.royaraqamia.app.chats.ChatsScreen
import com.royaraqamia.app.community.CommunityFeedScreen
import com.royaraqamia.app.community.CommunityPostScreen
import com.royaraqamia.app.community.CommunityRoutes
import com.royaraqamia.app.community.PostActionHandler
import com.royaraqamia.app.community.PostActionStatus
import com.royaraqamia.app.community.PostActionTarget
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.connectedapps.ConnectedAppsScreen
import com.royaraqamia.app.habitflow.HabitflowScreen
import com.royaraqamia.app.notes.NotesScreen
import com.royaraqamia.app.home.HomeDoor
import com.royaraqamia.app.home.HomeScreen
import com.royaraqamia.app.home.HomeServicesController
import com.royaraqamia.app.home.HomeServicesStatus
import com.royaraqamia.app.home.HomeTabStore
import com.royaraqamia.app.home.PreferencesHomeServicesStore
import com.royaraqamia.app.home.PreferencesHomeTabStore
import com.royaraqamia.app.linksnap.LinksnapAnalyticsExportCopy
import com.royaraqamia.app.athkar.AthkarPeriod
import com.royaraqamia.app.athkar.AthkarRoute
import com.royaraqamia.app.linksnap.LinksnapScreen
import com.royaraqamia.app.linksnap.LinksnapRoutes
import com.royaraqamia.app.linksnap.LinksnapShortenerScreen
import com.royaraqamia.app.linksnap.LinksnapUnlockScreen
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.plans.PlanScreen
import com.royaraqamia.app.profile.ProfileRoutes
import com.royaraqamia.app.profile.ProfileScreen
import com.royaraqamia.app.quran.QuranIndexRoute
import com.royaraqamia.app.mcp.ConnectionScreen
import com.royaraqamia.app.mcp.McpRoutes
import com.royaraqamia.app.quran.QuranRoutes
import com.royaraqamia.app.quran.QuranSurahRoute
import com.royaraqamia.app.news.NewsDigestScreen
import com.royaraqamia.app.notifications.NotificationsScreen
import com.royaraqamia.app.rates.RatesScreen
import com.royaraqamia.app.scan.ScanScreen

import com.royaraqamia.app.spendtrack.SpendtrackCsvCopy
import com.royaraqamia.app.spendtrack.SpendtrackScreen
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.blogpress.BlogpressPostRow
import com.royaraqamia.app.sync.SyncScheduler
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.update.ShellUpdateChannel
import com.royaraqamia.app.update.ShellUpdateController
import com.royaraqamia.app.update.ShellUpdateUiState
import com.royaraqamia.app.verify.VerifyCodeScreen
import com.royaraqamia.app.verify.VerifyRoutes
import com.royaraqamia.app.verify.VerifyScreen

/**
 * The app's launcher, and the frame it draws first (#647, ADR-0105).
 *
 * A cold launch is the platform splash, then this activity's first Compose frame —
 * the token theme, RTL, the tab bar — and only then whatever the destination needs.
 * No WebView is built to draw that frame, which is the difference between this and
 * the shell that shipped before; the document is opened afterwards, as a
 * destination ([WebSurface]).
 *
 * The activity is the app's navigation root, so it owns three things the WebView
 * owned by accident: the route a launch intent named ([DeepLink]), the stack the
 * back gesture walks ([ShellBackStack]), and the tab the frame lights
 * ([ShellTab]). All three are the site's own grammar, and each is unit-tested
 * rather than asserted here.
 *
 * **The document is the default, not the only answer (#872).** [NativeSurfaces]
 * names the routes whose port has passed the gate, and only those stay on this
 * frame; every other destination is handed to [WebSurface] - signed in or not,
 * because the site is what signs in. The frame is otherwise a launch screen
 * rather than a second design: it lifts the splash onto the app's own colours
 * and owns the update card. A route joins [NativeSurfaces] only with the change
 * that makes its screen indistinguishable from the page.
 */
class ShellActivity : ComponentActivity() {
    /** The route the frame is showing. */
    private var current by mutableStateOf(Routes.HOME)

    /** Where the user is, and where back goes from there. */
    private lateinit var stack: ShellBackStack

    /**
     * The app's composition root (#770): the session, the client and the store,
     * built once and restored on launch. Before this, only the debug workbench
     * ever held one, so the running app had no session at all.
     */
    private lateinit var graph: AppGraph

    /** One resolver for the whole app, so the preload and the composition share a cache. */
    private val fonts: FontFamily.Resolver by lazy { createFontFamilyResolver(this) }

    /** Whether the restored session answered, which decides what the frame holds. */
    private var signedIn by mutableStateOf(false)

    /**
     * The bell's number (#659), or null while there is no session to ask.
     *
     * Read after the session answers and again when the app comes back to the
     * foreground, so a notification that arrived while the document was on top is
     * the same number the site would show. A failed read leaves it null rather
     * than drawing a zero the app does not know ([ShellTopBar]).
     */
    private var unreadCount by mutableStateOf<Int?>(null)

    /**
     * Where a guest asked to go before signing in (#1208).
     *
     * The page's account door sends a guest through the login with
     * `redirect=/account/links`, so the sign-in itself is the document's. The
     * shell is what holds the destination: the session lands when the document
     * finishes, and that is the moment the frame can open the screen the page
     * would have redirected to. Cleared on a return that is still signed out, so
     * a cancelled sign-in does not move a later one.
     */
    private var pendingAfterSignIn: String? = null

    /**
     * Whether the frame was brought forward for an update card (#872).
     *
     * The document is on top by default, so a card that appears after launch has
     * to bring this activity forward to be seen at all; once the user has answered
     * it, [ShellUpdateUiState.Idle] is what sends them back to the document. The
     * flag is what keeps that second hand-over from happening at launch, where the
     * document was never vacated.
     */
    private var cardShown by mutableStateOf(false)

    /**
     * Whether نور's sheet is open (ADR-0143). It is component state rather than
     * a route: the sheet floats over the destination, and closing it leaves the
     * member on the screen they opened it from.
     */
    private var assistantOpen by mutableStateOf(false)

    /**
     * What نور's sheet last painted (ADR-0150).
     *
     * Closing the sheet throws its composition away, so the conversation, the
     * quota and the face it ended on live here instead: the next open paints
     * them immediately and revalidates behind the paint. A sign-out clears it,
     * because the next member must not see the previous one's thread.
     */
    private var assistantSnapshot by mutableStateOf<AssistantSnapshot?>(null)

    /**
     * The update channel (#652): the check, the download, the install, and the
     * card the frame draws when one of them has something to say. It is the
     * shell's rather than the page's — the document cannot reach native code
     * reliably ([com.royaraqamia.app.update.ShellUpdateController]) — and a build
     * below the site's floor never gets past it to the document at all.
     */
    private lateinit var update: ShellUpdateController

    /**
     * The homepage's apps (#1194): the picker's list, the row in flight and the
     * refused write's line. It lives here rather than in the sheet's composition
     * because the sheet is thrown away when it closes (ADR-0150's rule for نور),
     * and the next open has to paint the same list without re-reading.
     */
    private lateinit var homeServices: HomeServicesController

    /**
     * The tab the door draws under its strip (#1399, ADR-0151).
     *
     * The address (`/?tab=/<app>`) is read once into this state, then a tab tap
     * replaces it: the selection is a view of the door, not a route, so it never
     * pushes the back stack and `/` stays the destination. The device remembers
     * it so a cold launch paints the tab the member was last in, exactly as the
     * page's own `royaraqamia:home-tab:v1` preference does.
     */
    private var homeTab by mutableStateOf<String?>(null)

    /**
     * Whether [homeTab] came from an address rather than the stored preference.
     *
     * An address draws the app it names even when the strip does not hold it
     * (the page's rule for a shared LinkSnap link), while a remembered tab the
     * strip no longer holds falls back to the first app left.
     */
    private var homeDoorAddressed = false

    private lateinit var homeTabStore: HomeTabStore

    /**
     * Whether the apps picker is open (#1399).
     *
     * The door's own frame draws the sheet, but the first-run card inside the
     * door is what opens it for a member with no apps. Hoisting the flag here is
     * what lets the card and the top bar's trigger be one sheet rather than two.
     */
    private var servicesOpen by mutableStateOf(false)

    /** The radio-returns trigger for the Outbox (#650); closed with the activity. */
    private var networkWatch: java.io.Closeable? = null

    /**
     * The last route the escape hatch opened (#661).
     *
     * A route the switch sends to the browser is not a destination the frame
     * navigates to, so this is what keeps a second [handOver] for the same screen
     * from opening a second tab under a member who closed the first.
     */
    private var browserRoute: String? = null

    /**
     * The document, launched for result (#872).
     *
     * Since every destination is the document, the frame underneath has nothing to
     * show, so the document finishing is the one back that leaves the app
     * (ADR-0082). A plain `startActivity` cannot hear that; this can.
     *
     * The result now says *who* closed the document (#1246), and only the
     * document's own root back closes the app. The document is destroyed without
     * being asked in three other cases — a deep link rebasing this `singleTask`
     * activity's task, [bringFrameForward] drawing the update card over it, and a
     * process death whose task is restored — and the system reports each of them as
     * `RESULT_CANCELED`. Treating that as the root back closed the app from a screen
     * the user never left, so the frame now stays in front for every result but
     * [DocumentExit.LEAVES_THE_APP].
     */
    private val document: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (DocumentExit.leavesTheApp(result.resultCode)) finish()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch theme declares the platform splash items; this is what reads
        // them below API 31, and it has to run before `super.onCreate`, which is
        // where the starting window is replaced. The splash lifts on the app's own
        // first drawn frame — the frame below — so there is no colour change and no
        // second splash between here and [handOver].
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // The Arabic faces are ~350 KB of TTF, and decoding them is what the first
        // text costs: measured on the RMX3195, an empty frame reaches its first
        // `withFrameNanos` at ~290 ms and the same frame with these faces at ~440.
        // Warming them off the main thread moves that ~90 ms under the window work
        // instead of onto the frame. If the frame wins the race, Compose draws the
        // first text in the system face and re-lays it out when the font arrives.
        lifecycleScope.launch(Dispatchers.Default) {
            fonts.preload(RoyFonts.ui)
            fonts.preload(RoyFonts.digits)
        }

        val launch =
            DeepLink.targetOf(intent?.data?.toString()) ?: Routes.HOME
        stack = ShellBackStack(launch)
        // The door is native now, so `/?tab=/<app>` stays the door and selects
        // its tab (ADR-0151): the query is a view, not a route to push.
        homeTabStore = PreferencesHomeTabStore(this)
        homeTab = Routes.appTabOf(launch) ?: homeTabStore.read()
        homeDoorAddressed = Routes.appTabOf(launch) != null
        current = stack.route
        graph = AppGraph.create(this, BuildConfig.SITE_URL, BuildConfig.SUPABASE_AUTH_URL, BuildConfig.SUPABASE_ANON_KEY)
        update = ShellUpdateController(this, BuildConfig.SITE_URL, lifecycleScope)

        // The homepage's apps (#1194): the sheet's picker reads and writes them.
        // The controller is the shell's, so the record survives the sheet closing
        // and a refused write's line is still there when it opens again.
        homeServices =
            HomeServicesController(
                repository = graph.homeServices,
                guest = PreferencesHomeServicesStore(this),
                signedIn = { graph.signedIn },
                identityKey = { graph.session.storeIdentity.key },
            )

        // A queued write is delivered because the radio came back, not because
        // the user opened the screen that made it (#650). The launch path drains
        // in `graph.start()`; this is the reconnect while the app is open, and
        // the reconnect while it is not is the worker's floor (#651).
        networkWatch =
            Connectivity.watch(this) {
                lifecycleScope.launch { graph.drainOutbox() }
            }

        // The floor that covers what a push cannot (#651): enqueued from the
        // launcher rather than from the document's activity, because the app is
        // the launcher now and a device that never opens a web surface still
        // owes its queued writes.
        SyncScheduler.ensurePeriodic(this)

        setContent {
            RoyaraqamiaTheme {
                // The app is RTL before it is anything else (ADR-0089): the site is
                // Arabic, and a screen laid out left-to-right is the wrong screen.
                CompositionLocalProvider(
                    LocalLayoutDirection provides LayoutDirection.Rtl,
                    LocalFontFamilyResolver provides fonts,
                ) {
                    // Where the member is, for the assistant's eyes (ADR-0181,
                    // decision 6). One hook covers every way the shell moves - a
                    // tap, a back, a deep link, a sign-out - because `current` is
                    // the shell's only idea of a route. The turn reads it when it
                    // sends, never before.
                    LaunchedEffect(current) { PublishedScreen.follow(current) }

                    // The tab the door draws under its strip (#1399): the
                    // address names one, else the remembered tab when the strip
                    // still holds it, else the first app the member kept.
                    val doorTab =
                        HomeDoor.selected(
                            requested = homeTab.takeIf { homeDoorAddressed },
                            remembered = homeTab.takeIf { !homeDoorAddressed },
                            order = homeServices.order,
                        )

                    ShellFrame(
                        currentRoute = current,
                        unreadCount = unreadCount,
                        showAssistant = assistantVisible(current),
                        onOpenAssistant = {
                            if (signedIn) assistantOpen = true else showSignIn()
                        },
                        onSelect = { tab -> openRoute(tab.route) },
                        onOpenRoute = ::openRoute,
                        servicesOpen = servicesOpen,
                        onOpenServices = { servicesOpen = true },
                        onDismissServices = { servicesOpen = false },
                        homeOrder = homeServices.order,
                        homeBusy = homeServices.busy,
                        homeError = homeServices.error,
                        onToggleHomeService = { route ->
                            lifecycleScope.launch { homeServices.toggle(route) }
                        },
                        marketplace = graph.marketplace,
                        signedIn = signedIn,
                        onSignIn = ::showSignIn,
                        onOpenConnection = { id -> openRoute("/mcp/apps/$id") },
                        onOpenExternal = ::openExternal,
                        brandMark = graph.brandMark,
                        connectedApps = graph.connectedApps,
                        onConnectNew = { openRoute("/mcp/guide") },
                        onBack = ::goBack,
                    ) {
                        // The launch and every sign-in/sign-out run the same load:
                        // the device's list for a guest, the account's (merged once)
                        // for a member. The controller drops a repeat for one
                        // identity, so a recomposition cannot re-PUT the set.
                        LaunchedEffect(signedIn) { homeServices.identityChanged() }
                        when (Routes.normalize(current)) {
                            // The door (#1399): the nine apps as tabs under the
                            // strip, the selected one drawn beneath it, and the
                            // first-run card when the member has kept none. A tab
                            // is a selection, so `/` stays the destination.
                            "/" ->
                                HomeScreen(
                                    order = homeServices.order,
                                    status = homeServices.status,
                                    selected = doorTab,
                                    onSelect = ::selectHomeTab,
                                    onAddApp = { servicesOpen = true },
                                    onReorder = { next ->
                                        lifecycleScope.launch { homeServices.reorder(next) }
                                    },
                                    surface = { route -> HomeSurface(route) },
                                )
                            "/account" ->
                                AccountScreen(
                                    state = AccountUiState.of(signedIn),
                                    profileRepository = graph.accountProfile,
                                    usageRepository = graph.accountUsage,
                                    onOpenRoute = ::openRoute,
                                    onSignIn = ::showSignIn,
                                    onSignOut = ::signOut,
                                )
                            // The Admin Console index (#974, ADR-0193): the
                            // section cards over the server's `/api/me` answer.
                            // Drawn and off until its gate passes, so the
                            // document still opens on top of it (ADR-0117).
                            "/admin" ->
                                AdminConsoleRoute(
                                    profileRepository = graph.accountProfile,
                                    onDenied = { openRoute(Routes.HOME) },
                                    onOpenRoute = ::openRoute,
                                )
                            "/habitflow" -> HabitflowScreen(repository = graph.habitflow)
                            // Notes (#1390): drawn from the device store and its
                            // Outbox, switched on only after `check:visual` passes.
                            "/notes" -> NotesScreen(repository = graph.notes)
                            "/spendtrack" ->
                                SpendtrackScreen(
                                    route = Routes.normalize(current),
                                    repository = graph.spendtrack,
                                    onShareCsv = ::shareCsv,
                                )
                            "/account/faq" -> AccountFaqScreen()
                            // The Quran reader (#955): the sura index, the
                            // reader's last place, and the vendored text. The
                            // surah itself is the dynamic route below.
                            "/quran" ->
                                QuranIndexRoute(
                                    repository = graph.quran,
                                    onOpenSurah = { surah -> openRoute(QuranRoutes.routeOf(surah)) },
                                    onOpenAyah = { surah, ayah ->
                                        openRoute(QuranRoutes.routeOf(surah, ayah))
                                    },
                                )
                            // The Athkar reader (#1389): the two sittings are
                            // the page's own routes (ADR-0147), so the tab is a
                            // navigation rather than a second copy of the text.
                            "/athkar" ->
                                AthkarRoute(
                                    repository = graph.athkar,
                                    period = AthkarPeriod.Morning,
                                    onSelectPeriod = { option -> openRoute(option.route) },
                                )
                            "/athkar/evening" ->
                                AthkarRoute(
                                    repository = graph.athkar,
                                    period = AthkarPeriod.Evening,
                                    onSelectPeriod = { option -> openRoute(option.route) },
                                )
                            "/account/plan" ->
                                PlanScreen(
                                    repository = graph.usage,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                )
                            "/account/connected-apps" ->
                                ConnectedAppsScreen(
                                    repository = graph.connectedApps,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                    // The page's "connect a new client" opens the MCP
                                    // guide, which the app has no screen for yet: it
                                    // is a route the shell hands to the document.
                                    onConnectNew = { openRoute("/mcp/guide") },
                                )
                            // The members this account blocked (#977): the
                            // page's own read and unblock, drawn natively and
                            // off until its gate passes (ADR-0117), so the
                            // document still opens on top of it.
                            "/account/blocked" ->
                                BlockedMembersScreen(
                                    repository = graph.blockedMembers,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                )
                            // What the assistant remembers (#1428): the
                            // page's read, its three switches, its two
                            // controls per fact and its export. Ported and off
                            // until the visual gate passes (ADR-0117), so the
                            // document still opens on top of it.
                            "/account/memory" ->
                                MemoryScreen(
                                    repository = graph.memory,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                    onExport = ::openMemoryExport,
                                )
                            // The account news page (#950): the checklist, the
                            // private feeds and the proposal form. Ported and
                            // switched off until the visual gate passes.
                            "/account/news" ->
                                NewsScreen(
                                    repository = graph.news,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                )
                            // LinkSnap (#654): the page is the shortener and
                            // nothing else. The owned list is the account
                            // area's links page, which is its own route, and
                            // the page's own account door is the way there
                            // (#1208) - a guest is sent through the sign-in and
                            // lands on it once the session arrives.
                            "/linksnap" ->
                                LinksnapShortenerScreen(
                                    repository = graph.linksnap,
                                    siteUrl = BuildConfig.SITE_URL,
                                    signedIn = signedIn,
                                    onCopy = ::copyToClipboard,
                                    onShare = ::shareText,
                                    onSignIn = ::showSignIn,
                                    onOpenLinks = { openRoute("/account/links") },
                                    onSignInForLinks = {
                                        pendingAfterSignIn = "/account/links"
                                        showSignIn()
                                    },
                                )
                            "/account/links" ->
                                LinksnapScreen(
                                    repository = graph.linksnap,
                                    siteUrl = BuildConfig.SITE_URL,
                                    signedIn = signedIn,
                                    onCopy = ::copyToClipboard,
                                    onShare = ::shareText,
                                    onShareCsv = { name, content ->
                                        shareCsv(
                                            name,
                                            content,
                                            LinksnapAnalyticsExportCopy.EXPORT_TITLE,
                                        )
                                    },
                                    onSignIn = ::showSignIn,
                                )
                            // The certificate check (#658): public by design, so it
                            // is drawn whether or not there is a session, and its
                            // scanner link is the one destination it hands over.
                            "/verify" ->
                                VerifyScreen(
                                    repository = graph.verify,
                                    onCopy = ::copyToClipboard,
                                    onOpenScan = { openRoute("/scan") },
                                )
                            // The rates board (#658): public like the page, read once
                            // on arrival and painted from the last board kept when the
                            // read fails.
                            "/rates" -> RatesScreen(repository = graph.rates)
                            // The Scanner (#932): the camera, its permission and a
                            // decode that never leaves the phone. Drawn and off
                            // until the visual gate passes (ADR-0117), so the
                            // document still opens on top of it.
                            "/scan" ->
                                ScanScreen(
                                    siteUrl = BuildConfig.SITE_URL,
                                    repository = graph.scanHistory,
                                    signedIn = signedIn,
                                    onOpenRoute = ::openRoute,
                                    onOpenExternal = ::openExternal,
                                    onCopy = ::copyToClipboard,
                                )
                            // The public digest and the reader's own (#926): the
                            // page's day strip, cards and personal switch. Ported and
                            // off until the visual gate passes (ADR-0117), so the
                            // document still opens on top of it.
                            "/news" ->
                                NewsDigestScreen(
                                    repository = graph.newsDigest,
                                    onOpenUrl = ::openExternal,
                                    onSignIn = ::showSignIn,
                                    onSeePlans = { openRoute("/pricing") },
                                    onManageSources = { openRoute("/account/news") },
                                )
                            // The notification centre (#1391): the page's Alerts
                            // feed, its marks and its destinations. A write is a
                            // request followed by a re-read, and the bell's number
                            // is refreshed from the same answer.
                            "/notifications" ->
                                NotificationsScreen(
                                    repository = graph.notifications,
                                    signedIn = signedIn,
                                    onSignIn = ::showSignIn,
                                    onOpenRoute = ::openRoute,
                                    onChanged = {
                                        lifecycleScope.launch { refreshUnreadCount() }
                                    },
                                )
                            // The new-conversation panel (#934): the member
                            // directory and the direct picker. Ported and off
                            // until the visual gate passes (ADR-0117), so the
                            // document still opens on top of it; the direct pick
                            // opens the site's own preview.
                            "/chats/new" ->
                                ChatNewScreen(
                                    repository = graph.chats,
                                    onOpenPeer = ::openChatPreview,
                                )
                            // The community feed (#658): public like the page, so
                            // a guest reads it, and the last page read is painted
                            // with the banner that says it is one when the radio is
                            // off. A card's destinations are routes, not screens:
                            // the post and the profile are the document for now.
                            "/community" ->
                                CommunityFeedScreen(
                                    repository = graph.community,
                                    editorStore = graph.communityEditor,
                                    composerStore = graph.communityComposer,
                                    engagementRepository = graph.communityEngagement,
                                    onSharePost = { slug ->
                                        shareText("https://${DeepLink.HOST}/community/$slug")
                                    },
                                    onSignIn = ::showSignIn,
                                    signedIn = signedIn,
                                    currentUserId = (graph.session.storeIdentity as? Identity.User)?.id,
                                    onOpenPost = { slug -> openRoute(CommunityRoutes.postOf(slug)) },
                                    onOpenProfile = { username ->
                                        openRoute(ProfileRoutes.profileOf(username))
                                    },
                                    postActions = postActions(),
                                )
                            // A shared certificate (#658): the link a printed QR
                            // carries. The code is the route's own segment, so this
                            // is the one destination the shell reads out of a route
                            // rather than matching whole.
                            // A thread (#819): the conversation the site's row
                            // opens, drawn from the same three routes. The member
                            // picker is its own screen above (#934).
                            else -> {
                                val conversationId = ChatRoutes.idOf(current)
                                val unlock = LinksnapRoutes.codeOf(current)
                                val quranSurah = QuranRoutes.surahOf(current)
                                val postSlug = CommunityRoutes.slugOf(current)
                                val profileUsername = ProfileRoutes.usernameOf(current)
                                when {
                                    // One public post (#922): the page's own
                                    // Markdown body, drawn natively and off until
                                    // the visual gate passes (ADR-0117), so the
                                    // document still opens on top of it.
                                    postSlug != null ->
                                        CommunityPostScreen(
                                            slug = postSlug,
                                            repository = graph.communityPost,
                                            engagementRepository = graph.communityEngagement,
                                            onSharePost = {
                                                shareText(
                                                    "https://${DeepLink.HOST}/community/$postSlug"
                                                )
                                            },
                                            onSignIn = ::showSignIn,
                                            signedIn = signedIn,
                                            currentUserId =
                                                (graph.session.storeIdentity as? Identity.User)?.id,
                                            onOpenProfile = { username ->
                                                openRoute(ProfileRoutes.profileOf(username))
                                            },
                                            postActions =
                                                postActions(edit = { target ->
                                                    openRoute(CommunityRoutes.postOf(target.slug))
                                                }),
                                        )
                                    // A public member's profile (#927): the page's
                                    // header and posts, drawn natively and off until
                                    // the visual gate passes (ADR-0117), so the
                                    // document still opens on top of it.
                                    profileUsername != null ->
                                        ProfileScreen(
                                            username = profileUsername,
                                            repository = graph.profile,
                                            onOpenPost = { slug ->
                                                openRoute(CommunityRoutes.postOf(slug))
                                            },
                                            onOpenProfile = { username ->
                                                openRoute(ProfileRoutes.profileOf(username))
                                            },
                                            onOpenChat = ::openChatPreview,
                                            onSignIn = ::showSignIn,
                                        )
                                    quranSurah != null ->
                                        QuranSurahRoute(
                                            repository = graph.quran,
                                            number = quranSurah,
                                            targetAyah = QuranRoutes.ayahOf(current),
                                            onSavePosition = { ayah ->
                                                lifecycleScope.launch(Dispatchers.IO) {
                                                    graph.quran.savePosition(quranSurah, ayah)
                                                }
                                            },
                                        )
                                    ChatRoutes.isChatsTab(current) ->
                                        ChatsScreen(
                                            repository = graph.chats,
                                            presence = graph.chatPresence,
                                            assistantTurns = graph.assistantTurns,
                                            onOpenThread = { openRoute(ChatRoutes.threadOf(it)) },
                                            onOpenAssistant = { openRoute(ChatRoutes.threadOf(it)) },
                                            onNewChat = { openRoute("/chats/new") },
                                        )
                                    conversationId != null ->
                                        ChatThread(
                                            conversationId = conversationId,
                                            repository = graph.chats,
                                            hints = graph.chatHints,
                                            presence = graph.chatPresence,
                                            onOpenAttachment = ::openExternal,
                                            // The assistant's thread is the
                                            // document: it streams rather than
                                            // reads, and its own stage ports it.
                                            onOpenAssistantThread = { openRoute(it) },
                                        )
                                    unlock != null ->
                                        // A protected link (#654): the same route
                                        // the site serves, and the same live read.
                                        // The destination opens in the browser,
                                        // which is where the site's form sends a
                                        // visitor too.
                                        LinksnapUnlockScreen(
                                            code = unlock,
                                            repository = graph.linksnap,
                                            onOpenUrl = ::openExternal,
                                            onBack = { openRoute("/linksnap") },
                                        )
                                    else ->
                                        McpRoutes.connectionOf(current)?.let { connectionId ->
                                            // The post-connect screen (#1256): it passed the
                                            // visual gate, so the shell draws it and the
                                            // document no longer opens on top (ADR-0118).
                                            ConnectionScreen(
                                                repository = graph.mcpConnection,
                                                store = graph.marketplace,
                                                connectionId = connectionId,
                                                signedIn = signedIn,
                                                connected = current.contains("connect=done"),
                                                onSignIn = ::showSignIn,
                                                onOpenExternal = ::openExternal,
                                                onDisconnected = { openRoute(McpRoutes.APPS) },
                                            )
                                        } ?: VerifyRoutes.codeOf(current)?.let { code ->
                                            VerifyCodeScreen(
                                                code = code,
                                                repository = graph.verify,
                                                siteUrl = BuildConfig.SITE_URL,
                                                onCopy = ::copyToClipboard,
                                                onOpenRoute = ::openRoute,
                                            )
                                        }
                                }
                            }
                        }
                    }
                }
                LaunchedEffect(Unit) {
                    // One drawn frame first: the splash lifts onto the app's own
                    // chrome, and only then does the destination open. Without this
                    // the hand-over would replace the frame before it was seen, and
                    // the splash would lift onto the document instead.
                    withFrameNanos { }
                    // The escape hatch (#661): read beside the session, so the
                    // first hand-over already knows which surfaces the operator
                    // sent to the system browser. A config server that is slow or
                    // unreachable is the native answer after this cap rather than
                    // a launch held open, and the frame underneath is already
                    // drawn, so the cap costs the document no paint.
                    val escapeHatch =
                        async(Dispatchers.IO) {
                            ShellConfig.read(ShellConfig.configUrl(BuildConfig.SITE_URL))
                        }
                    signedIn = graph.start()
                    BrowserEscape.publish(
                        withTimeoutOrNull(CONFIG_WAIT_MS) { escapeHatch.await() } ?: emptySet()
                    )
                    handOver()
                    // The launch half of "a queued write survives the process"
                    // (#650): the queue is on disk, so a process that was killed
                    // with writes pending drains as soon as the session answers.
                    // After `handOver`, so a long queue cannot delay the frame.
                    if (signedIn) {
                        // The count is a second read rather than part of the frame:
                        // a slow answer must not hold up the menu or the queue.
                        lifecycleScope.launch { refreshUnreadCount() }
                    }
                    // The lead queue is anonymous, so a guest's unsent lead drains
                    // too; the owned queues inside return early when there is no
                    // session to send with (#929).
                    graph.drainOutbox()
                }

                // A screen that reached a `426` publishes the floor here (#503),
                // and the card is the shell's: this is where the number becomes
                // one. Reading the channel in the composition is what makes a
                // floor that arrived while the document was on top recompose.
                LaunchedEffect(ShellUpdateChannel.floor) {
                    update.requireUpdate(ShellUpdateChannel.floor)
                }

                // An update the user has to answer is the one screen the frame still
                // owns (#872, #652): the document is on top, so the frame is brought
                // forward to be seen at all, and answering the card hands the
                // destination back. A card that arrived while the document was open
                // would otherwise never be seen, and an app that cannot announce an
                // APK is an app that never updates.
                LaunchedEffect(update.state) {
                    when (update.state) {
                        is ShellUpdateUiState.Asking -> {
                            cardShown = true
                            bringFrameForward()
                        }
                        is ShellUpdateUiState.Idle ->
                            if (cardShown) {
                                cardShown = false
                                handOver()
                            }
                        else -> Unit
                    }
                }

                ShellUpdatePrompt(
                    state = update.state,
                    onInstall = update::install,
                    onRetry = update::retry,
                    onLater = update::decline,
                    onCancelDownload = update::cancelDownload,
                )

                if (assistantOpen) {
                    AssistantSheet(
                        repository = graph.chats,
                        turns = graph.assistantTurns,
                        signedIn = signedIn,
                        snapshot = assistantSnapshot,
                        onSnapshot = { assistantSnapshot = it },
                        onDismiss = { assistantOpen = false },
                        onSignIn = {
                            assistantOpen = false
                            showSignIn()
                        },
                        onOpenAttachment = ::openExternal,
                    )
                }
            }
        }

        // The launch check (#652): the card is drawn by the frame above, and the
        // manifest is read off the main thread, so a slow answer never holds the
        // first frame.
        update.maybeCheck(true)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    goBack()
                }
            },
        )
    }

    /**
     * The one back the app has: the gesture, and the secondary frame's floating
     * control (#967), walk the same stack.
     */
    private fun goBack() {
        // The assistant's sheet is an overlay, so back closes it before the
        // destination under it moves (ADR-0143).
        if (assistantOpen) {
            assistantOpen = false
            return
        }
        // A card the frame was brought forward for is a screen of its own (#652):
        // back is "later", not a walk down a stack the user cannot see.
        if (update.state !is ShellUpdateUiState.Idle) {
            update.decline()
            return
        }
        if (stack.back()) {
            current = stack.route
            handOver()
        } else {
            // Home is the root (ADR-0082): this is the one back that closes the
            // app, and no other destination may reach it.
            finish()
        }
    }

    override fun onNewIntent(intent: Intent) {        super.onNewIntent(intent)
        // `setIntent` keeps `getIntent()` in step, the way the WebView shell does:
        // a configuration change recreates the activity from this intent.
        setIntent(intent)
        val target = DeepLink.targetOf(intent.data?.toString()) ?: return
        // The escape hatch (#661): a switched surface opens in the system browser
        // and the frame stays where the member was, so closing the tab returns to
        // the screen they came from rather than a native screen being bypassed.
        val addressed = Routes.appTabOf(target)
        if (openInBrowserIfSwitched(addressed ?: target)) return
        // A link can arrive while the document is in front; the session it holds
        // is what the route it names needs (#1194).
        lifecycleScope.launch { refreshSession() }
        // A door address selects a tab at `/` rather than becoming a route of
        // its own (#1399, ADR-0151): the door is the native screen now.
        stack.reset(if (addressed != null) Routes.HOME else target)
        if (addressed != null) {
            homeTab = addressed
            homeDoorAddressed = true
        }
        current = stack.route
        handOver()
    }

    /**
     * Coming back to the app is when the bell is most likely stale: the
     * notification centre is still the document, so a read that happened there
     * has to reach the frame that is underneath it.
     *
     * The update check rides the same return (#652): a shell that was in the
     * background for a day should look again, and an install parked on the
     * "install unknown apps" setting continues here.
     */
    override fun onResume() {
        super.onResume()
        // The document is the site, so the site is where a member signs in (#1194):
        // the jar it left behind is the session this frame paints. Reading it is
        // cheap and needs no radio, so it runs on every return rather than only
        // when the app was signed out.
        lifecycleScope.launch { refreshSession() }
        // The escape hatch (#661) is a server-side switch, so a shell that comes
        // back to the front reads it again: turning one surface on or off costs a
        // deploy, not a release. The next navigation applies it, and a failed
        // read is the native answer (ShellConfig answers the empty set).
        lifecycleScope.launch {
            BrowserEscape.publish(
                withContext(Dispatchers.IO) {
                    ShellConfig.read(ShellConfig.configUrl(BuildConfig.SITE_URL))
                }
            )
        }
        update.maybeCheck(false)
        update.resume()
    }

    /**
     * Adopts the document's session and paints what it says (#1194): the session
     * itself, the bell's count and, through `LaunchedEffect(signedIn)`, the
     * homepage's account set. A signed-out page clears all three.
     */
    private suspend fun refreshSession() {
        val wasSignedIn = signedIn
        signedIn = graph.syncDocumentSession()
        if (signedIn) {
            refreshUnreadCount()
            // The sign-in that just completed is what opens a door a guest had
            // already pressed (#1208): the page would have redirected them to
            // `/account/links` from the login, and the frame draws the same
            // destination natively.
            if (!wasSignedIn) {
                pendingAfterSignIn?.let { target ->
                    pendingAfterSignIn = null
                    // The login was a step, not a destination: the entry it left
                    // on the stack is replaced so back from the links page is the
                    // page the guest came from.
                    stack.replace(target)
                    current = stack.route
                    handOver()
                }
            }
        } else {
            unreadCount = null
            pendingAfterSignIn = null
        }
    }

    /**
     * Releases the network watcher and the update channel: a callback that
     * outlives the activity would keep the composition root, and with it a
     * database connection, alive.
     */
    override fun onDestroy() {
        networkWatch?.close()
        networkWatch = null
        update.shutdown()
        super.onDestroy()
    }

    /**
     * Navigate to a route: a tab, a services row, or anything else the frame
     * offers. The route decides whether the shell draws it or hands it over.
     *
     * A door address (`/?tab=/<app>`) no longer becomes the app's own route
     * (#1399): `/` is the door and the query selects its tab (ADR-0151), so the
     * app still renders natively, under the strip, and a shared link keeps the
     * strip the page keeps.
     */
    private fun openRoute(route: String) {
        // The escape hatch (#661): a surface the remote switch sent to the
        // browser is one the app does not navigate to at all, so the frame stays
        // on the screen the member was reading and the tab opens over it.
        if (openInBrowserIfSwitched(route)) return

        val addressed = Routes.appTabOf(route)
        if (addressed != null) {
            // The tab's own route is what the switch names: `/?tab=/rates` is the
            // door's address for `/rates`, and it is `/rates` the operator switches.
            if (openInBrowserIfSwitched(addressed)) return
            selectHomeTab(addressed)
            if (stack.route != Routes.HOME) {
                stack.open(Routes.HOME)
            }
        } else {
            stack.open(route)
        }
        current = stack.route
        // A tap is a navigation, so a web-backed destination is opened again even
        // when it is the one already showing.
        handOver()
    }

    /**
     * A tab was chosen on the door (#1399): the selection is a view, so it
     * replaces the remembered tab and never the route — back leaves the door
     * rather than walking the tabs. Choosing a tab is the member's own action,
     * so a tab the strip holds no longer counts as an address.
     */
    private fun selectHomeTab(route: String) {
        // The door draws a switched app in the system browser rather than under
        // its strip (#661): a tab is a destination, and this one is the page.
        if (openInBrowserIfSwitched(route)) return

        homeTab = route
        homeDoorAddressed = false
        homeTabStore.write(route)
    }

    /**
     * The surface a door tab draws (#1399): each app is the same native screen
     * its own route draws, handed the same repositories and the same callbacks.
     *
     * The door owns the strip and the selection; the screen under it owns its
     * data, so a tab cannot drift from its route by being composed from a second
     * copy of the layout. A route the catalog does not hold draws nothing, which
     * is the strip's own rule for a retired app.
     */
    @Composable
    private fun HomeSurface(route: String) {
        when (route) {
            "/news" ->
                NewsDigestScreen(
                    repository = graph.newsDigest,
                    onOpenUrl = ::openExternal,
                    onSignIn = ::showSignIn,
                    onSeePlans = { openRoute("/pricing") },
                    onManageSources = { openRoute("/account/news") },
                )
            "/rates" -> RatesScreen(repository = graph.rates)
            "/scan" ->
                ScanScreen(
                    siteUrl = BuildConfig.SITE_URL,
                    repository = graph.scanHistory,
                    signedIn = signedIn,
                    onOpenRoute = ::openRoute,
                    onOpenExternal = ::openExternal,
                    onCopy = ::copyToClipboard,
                )
            "/quran" ->
                QuranIndexRoute(
                    repository = graph.quran,
                    onOpenSurah = { surah -> openRoute(QuranRoutes.routeOf(surah)) },
                    onOpenAyah = { surah, ayah ->
                        openRoute(QuranRoutes.routeOf(surah, ayah))
                    },
                )
            "/athkar" ->
                AthkarRoute(
                    repository = graph.athkar,
                    period = AthkarPeriod.Morning,
                    onSelectPeriod = { option -> openRoute(option.route) },
                )
            "/linksnap" ->
                LinksnapShortenerScreen(
                    repository = graph.linksnap,
                    siteUrl = BuildConfig.SITE_URL,
                    signedIn = signedIn,
                    onCopy = ::copyToClipboard,
                    onShare = ::shareText,
                    onSignIn = ::showSignIn,
                    onOpenLinks = { openRoute("/account/links") },
                    onSignInForLinks = {
                        pendingAfterSignIn = "/account/links"
                        showSignIn()
                    },
                )
            "/habitflow" -> HabitflowScreen(repository = graph.habitflow)
            "/spendtrack" ->
                SpendtrackScreen(
                    route = route,
                    repository = graph.spendtrack,
                    onShareCsv = { name, content -> shareCsv(name, content) },
                )
            "/notes" -> NotesScreen(repository = graph.notes)
        }
    }

    /**
     * The bell's number, from the route the site's own bell reads (#659).
     *
     * Null is the honest answer for a guest, a refusal or an unreachable server:
     * the bell is drawn only when it has a count to stand behind, never as a zero
     * the app cannot vouch for.
     */
    private suspend fun refreshUnreadCount() {
        unreadCount =
            when (val result = graph.notifications.unreadCount()) {
                is ApiResult.Success -> result.value
                is ApiResult.Failure -> null
            }
    }

    /**
     * A screen's guest prompt asked to sign in: the site's own login page, opened
     * in the document (#872).
     *
     * The frame used to draw a native card here (#770), and it was a bare Material
     * form next to the site's glass one - a different screen with the same job. The
     * page is the sign-in screen again until a port can say otherwise.
     */
    private fun showSignIn() {
        signedIn = false
        unreadCount = null
        // The next session must not paint this member's conversation first.
        assistantOpen = false
        assistantSnapshot = null
        openRoute("/auth/login")
    }

    /**
     * The memory page's export (#1428): the page's own route, opened as a file.
     *
     * The answer is an attachment (`content-disposition`), so the document is
     * what downloads it — the screen owns no storage and no downloader, and the
     * file the member gets is byte for byte the site's.
     */
    private fun openMemoryExport() {
        document.launch(WebSurface.intentFor(this, MemoryRepository.EXPORT_PATH))
    }

    /**
     * The account screen's sign-out (#948): the graph drops the session and
     * closes the stores, which keeps the rows on disk while unlinking them from
     * an identity (ADR-0027). The next member opens their own namespace, so no
     * previous account's row can be painted behind them.
     *
     * Home is where the site sends a member after signing out, so the shell
     * starts its stack there rather than leaving the account page behind.
     */
    private fun signOut() {
        lifecycleScope.launch {
            graph.signOut()
            signedIn = false
            unreadCount = null
            assistantOpen = false
            assistantSnapshot = null
            // The next turn is the next member's screen, not this one's (ADR-0181).
            PublishedScreen.clear()
            stack.reset(Routes.HOME)
            current = stack.route
            handOver()
        }
    }

    /**
     * Brings the frame back to the front, over the document (#872). Used for the
     * update card and nothing else: a destination is handed *to* the document, and
     * the only thing the frame has to say about it is that a newer APK exists.
     */
    private fun bringFrameForward() {
        startActivity(
            Intent(this, ShellActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        )
    }

    /**
     * The new-conversation screen's direct pick (#934): the site's own empty chat
     * screen, which sends the request from its one button.
     *
     * The route is the same normalized destination with the member's handle in
     * the query, so the stack entry is replaced rather than pushed — opening
     * `/chats/new` again would be a no-op — and the document is handed the query.
     */
    private fun openChatPreview(username: String) {
        val encoded = java.net.URLEncoder.encode(username, "UTF-8")
        stack.replace("/chats/new?to=$encoded")
        current = stack.route
        handOver()
    }

    /**
     * The certificate card's copy action (#658): the platform's clipboard, which is
     * the shell's to reach. The screen takes it as a callback so the card can be
     * drawn in a test without one.
     */
    private fun copyToClipboard(text: String) {
        val clipboard = getSystemService(ClipboardManager::class.java) ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText(CLIPBOARD_LABEL, text))
    }

    /**
     * The CSV the page downloads, as the app's share sheet (#961, #964).
     *
     * The app has no Downloads folder it owns, so it writes the same file to its
     * own cache and hands the platform a read grant on exactly that file.
     * SpendTrack hands over the route's own bytes; LinkSnap hands over the rows
     * its route returns, written with the page's header and escaping
     * (`LinksnapAnalyticsCsv`), so a member shares the same rows and columns on
     * both clients.
     */
    private fun shareCsv(
        fileName: String,
        content: String,
        title: String = SpendtrackCsvCopy.EXPORT_TITLE,
    ) {
        runCatching {
            val file = File(cacheDir, fileName)
            file.writeText(content)
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            val send =
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/csv"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            startActivity(Intent.createChooser(send, title))
        }
    }

    /**
     * The shortener's share action (#916): the platform sheet, the way the page's
     * `navigator.share` hands the same URL to the device. The screen takes it as a
     * callback so it can be drawn without an activity.
     */
    private fun shareText(text: String) {
        val send =
            Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
        runCatching { startActivity(Intent.createChooser(send, null)) }
    }

    /**
     * The post's Markdown export, as the app's share sheet (#952).
     *
     * The site downloads a `.md` file; the app has no Downloads folder it owns,
     * so it writes the same body to its own cache and hands the platform a read
     * grant on exactly that file. Markdown is the only export left, so there is
     * no format switch that could still produce an HTML file.
     */
    private fun sharePostMarkdown(label: String, content: String) {
        runCatching {
            val safe = label.replace(Regex("[^\\p{L}\\p{N} _-]"), "").trim().ifEmpty { "post" }
            val file = File(cacheDir, "$safe.md")
            file.writeText(content)
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            val send =
                Intent(Intent.ACTION_SEND).apply {
                    type = "text/markdown"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
            startActivity(Intent.createChooser(send, label))
        }
    }

    /**
     * The owner's post actions, over the same BlogPress store the editor uses.
     *
     * The publication transitions stay online-only like the page (ADR-0031), but
     * a delete or an undo is a durable intent first: it commits locally and the
     * drain then tries the server, so a shut radio cannot lose the member's tap.
     */
    private fun postActions(edit: ((PostActionTarget) -> Unit)? = null): PostActionHandler {
        val store = graph.blogpress

        suspend fun ownedRow(target: PostActionTarget): BlogpressPostRow? {
            val seed =
                BlogpressPostRow(
                    clientId = target.id,
                    id = target.id,
                    slug = target.slug,
                    content = target.content.orEmpty(),
                    status =
                        when (target.status) {
                            PostActionStatus.DRAFT -> "draft"
                            PostActionStatus.PUBLISHED -> "published"
                            PostActionStatus.SCHEDULED -> "scheduled"
                        },
                    coverImage = "",
                    metaTitle = target.metaTitle.orEmpty(),
                    metaDesc = "",
                    publishAt = null,
                    publishedAt = null,
                    viewCount = 0,
                    featured = target.featured,
                    communityVisible = true,
                    readingTimeMinutes = 0,
                    createdAt = "",
                    updatedAt = "",
                    deletedAt = null,
                )
            // An existing row wins: it may hold a queued draft the feed never saw.
            return store.editorPost(target.id) ?: store.rememberPost(seed)
        }

        return PostActionHandler(
            edit = edit,
            publish = { target, publish ->
                val answer =
                    if (publish) store.publishPost(target.id) else store.unpublishPost(target.id)
                answer is ApiResult.Success
            },
            featured = { target, featured ->
                store.setFeatured(target.id, featured) is ApiResult.Success
            },
            exportMarkdown = { target ->
                sharePostMarkdown(target.metaTitle ?: target.slug, target.content.orEmpty())
            },
            delete = { target ->
                val row = ownedRow(target)
                if (row == null) {
                    false
                } else {
                    val done = store.deletePost(row.clientId)
                    if (done) store.drain()
                    done
                }
            },
            restore = { target ->
                val row = ownedRow(target)
                if (row == null) {
                    false
                } else {
                    val done = store.restorePost(row.clientId) != null
                    if (done) store.drain()
                    done
                }
            },
        )
    }

    private fun openExternal(url: String) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
    }

    /**
     * The two routes the site's launcher hides on (ADR-0143): the conversation's
     * own screen is already the door, and a sign-in flow is a page whose job is
     * to leave. Mirrors `frontend/ui/assistant/assistant-launcher.tsx`.
     */
    private fun assistantVisible(route: String): Boolean {
        val path = Routes.normalize(route)
        return path != "/chats" &&
            !path.startsWith("/chats/") &&
            path != "/auth" &&
            !path.startsWith("/auth/")
    }

    /**
     * Opens the current destination in the document (#647, #872).
     *
     * Every route goes there now, signed in or not: the site is the app's UI, and
     * it is also what signs in, so a guest sees the page's own login instead of a
     * second drawing of it. The shell stays underneath, which is what makes an
     * update card able to come forward over the document (#652) and back from a web
     * surface land on the frame rather than closing the app (ADR-0105).
     *
     * A destination with a native screen stays on the frame when
     * [NativeSurfaces.isNative] and [NATIVE_SURFACES_VISIBLE] both say so. While the
     * hold stands, the Custom Tab escape hatch (#661) is held too: a tab that
     * dismisses back into the frame would put a Compose screen in front of a
     * member again. The ports stay in the tree and keep their gates; a member must
     * not see a half-drawn screen until the native set is complete. A build below
     * the site's floor never gets there (#652, ADR-0114): every owned route would
     * answer `426`, so the blocking card is the honest screen rather than a
     * document that refuses everything it is asked.
     */
    private fun handOver() {
        if (isFinishing || isDestroyed) return
        if (update.blocksHandover) return
        // The escape hatch outranks the native screen too (#661): the switch
        // exists for the case where the native screen is the broken thing, so a
        // switched route never reaches NativeSurfaces or the document. The
        // document-only hold outranks both: there is no native screen to escape.
        if (NATIVE_SURFACES_VISIBLE && BrowserEscape.opensInBrowser(stack.route)) {
            // One screen opens one tab: the shell re-hands a destination over on
            // several paths (a card, a return from sign-in), and a member who just
            // closed the tab must not be sent straight back into it.
            if (browserRoute != stack.current) {
                browserRoute = stack.current
                CustomTab.open(this, DeepLink.webUrl(stack.current))
            }
            return
        }
        browserRoute = null
        if (NATIVE_SURFACES_VISIBLE && NativeSurfaces.isNative(stack.route)) return
        document.launch(WebSurface.intentFor(this, stack.current))
    }

    /**
     * Opens [route] in the system browser when the remote switch names it (#661),
     * and answers whether it did.
     *
     * The app stays on the screen it was on: a switched surface is a page the app
     * does not draw, not a destination it navigates to, so a back from the tab
     * lands where the member was (the acceptance the issue states).
     */
    private fun openInBrowserIfSwitched(route: String): Boolean {
        // A build below the site's floor is told to update before any destination
        // opens (#652, ADR-0114), and the escape hatch is a destination.
        if (update.blocksHandover) return false
        if (!NATIVE_SURFACES_VISIBLE) return false
        if (!BrowserEscape.opensInBrowser(route)) return false
        CustomTab.open(this, DeepLink.webUrl(route))
        return true
    }

    private companion object {
        /**
         * Whether the shell may draw its own ports or send a surface to a Custom
         * Tab. Held off so the cut ships one client: the Kotlin screens stay
         * compiled and gated, but the site's page is what a member sees on every
         * route until the ports are complete. A below-floor build still sees the
         * blocking update card.
         */
        const val NATIVE_SURFACES_VISIBLE = false

        /** What the clipboard entry is labelled on the device. */
        const val CLIPBOARD_LABEL = "certificate-code"

        /**
         * How long a launch waits for the escape hatch before it answers "native"
         * (#661). The switch is one small JSON document on our own origin, and the
         * cap is what keeps an unreachable config server from holding the launch.
         */
        const val CONFIG_WAIT_MS = 1_200L
    }
}
