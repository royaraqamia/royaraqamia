package com.royaraqamia.app.shell

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.royaraqamia.app.AppGraph
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.auth.SignInCard
import com.royaraqamia.app.auth.SignInUiState
import com.royaraqamia.app.habitflow.HabitflowScreen
import com.royaraqamia.app.net.Connectivity
import kotlinx.coroutines.launch
import com.royaraqamia.app.theme.RoyaraqamiaTheme

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

    /** Whether the restored session answered, which decides what the frame holds. */
    private var signedIn by mutableStateOf(false)

    private var authState by mutableStateOf<SignInUiState>(SignInUiState.Idle)

    /** The radio-returns trigger for the Outbox (#650); closed with the activity. */
    private var networkWatch: java.io.Closeable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // The launch theme declares the platform splash items; this is what reads
        // them below API 31, and it has to run before `super.onCreate`, which is
        // where the starting window is replaced. The splash lifts on the app's own
        // first drawn frame — the frame below — so there is no colour change and no
        // second splash between here and [handOver].
        installSplashScreen()
        super.onCreate(savedInstanceState)

        stack = ShellBackStack(DeepLink.targetOf(intent?.data?.toString()) ?: Routes.HOME)
        current = stack.route
        graph = AppGraph.create(this, BuildConfig.SITE_URL, BuildConfig.SUPABASE_AUTH_URL, BuildConfig.SUPABASE_ANON_KEY)

        // A queued write is delivered because the radio came back, not because
        // the user opened the screen that made it (#650). The launch path drains
        // in `graph.start()`; this is the reconnect while the app is open.
        networkWatch =
            Connectivity.watch(this) {
                lifecycleScope.launch { graph.drainOutbox() }
            }

        setContent {
            RoyaraqamiaTheme {
                // The app is RTL before it is anything else (ADR-0089): the site is
                // Arabic, and a screen laid out left-to-right is the wrong screen.
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    ShellFrame(
                        currentRoute = current,
                        onSelect = { tab -> openRoute(tab.route) },
                        onOpenRoute = ::openRoute,
                    ) {
                        if (NativeSurfaces.isNative(current)) {
                            HabitflowScreen(repository = graph.habitflow)
                        }
                        if (!signedIn) {
                            SignInCard(
                                state = authState,
                                onSignIn = { email, password -> signIn(email, password) },
                            )
                        }
                    }
                }
                LaunchedEffect(Unit) {
                    // One drawn frame first: the splash lifts onto the app's own
                    // chrome, and only then does the destination open. Without this
                    // the hand-over would replace the frame before it was seen, and
                    // the splash would lift onto the document instead.
                    withFrameNanos { }
                    signedIn = graph.start()
                    handOver()
                    // The launch half of "a queued write survives the process"
                    // (#650): the queue is on disk, so a process that was killed
                    // with writes pending drains as soon as the session answers.
                    // After `handOver`, so a long queue cannot delay the frame.
                    if (signedIn) graph.drainOutbox()
                }
            }
        }

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (stack.back()) {
                        current = stack.route
                    } else {
                        // Home is the root (ADR-0082): this is the one back that
                        // closes the app, and no other destination may reach it.
                        finish()
                    }
                }
            },
        )
    }

    override fun onNewIntent(intent: Intent) {        super.onNewIntent(intent)
        // `setIntent` keeps `getIntent()` in step, the way the WebView shell does:
        // a configuration change recreates the activity from this intent.
        setIntent(intent)
        val target = DeepLink.targetOf(intent.data?.toString()) ?: return
        stack.reset(target)
        current = stack.route
        handOver()
    }

    /**
     * Releases the network watcher: a callback that outlives the activity would
     * keep the composition root, and with it a database connection, alive.
     */
    override fun onDestroy() {
        networkWatch?.close()
        networkWatch = null
        super.onDestroy()
    }

    /**
     * Navigate to a route: a tab, a services row, or anything else the frame
     * offers. The route decides whether the shell draws it or hands it over.
     */
    private fun openRoute(route: String) {
        stack.open(route)
        current = stack.route
        // A tap is a navigation, so a web-backed destination is opened again even
        // when it is the one already showing.
        handOver()
    }

    /**
     * One sign-in attempt (#770): the state the card draws while it is in flight,
     * then whatever the server answered. A success is the only outcome that
     * unlocks the frame, so a refusal leaves the form where it was.
     */
    private fun signIn(email: String, password: String) {
        if (authState is SignInUiState.Busy) return
        authState = SignInUiState.Busy
        lifecycleScope.launch {
            val outcome = graph.signIn(email, password)
            authState = SignInUiState.of(outcome)
            signedIn = graph.signedIn
            if (signedIn) handOver()
        }
    }

    /**
     * Opens the current destination in the document when the shell cannot draw it.
     *
     * The shell stays underneath, which is what makes back from a web surface land
     * on the app's own frame rather than closing the app (ADR-0105). When the
     * destination has a native screen, this does nothing and the frame's content
     * area is the screen.
     */
    private fun handOver() {
        if (!signedIn) return
        if (NativeSurfaces.isNative(stack.route)) return
        WebSurface.open(this, stack.current)
    }
}
