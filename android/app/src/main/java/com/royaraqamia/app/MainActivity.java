package com.royaraqamia.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Process;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Logger;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginLoadException;
import com.getcapacitor.PluginManager;
import com.getcapacitor.WebViewListener;

import java.util.ArrayList;
import java.util.List;

/**
 * The shell loads the live site from {@code server.url}, so Capacitor does not
 * follow the URL an intent arrived with — it has no reason to, the configured
 * origin is the app. Deep links therefore have to be turned back into a
 * navigation here.
 *
 * Two shapes arrive: verified App Links, which are already the https URL we
 * want, and the {@code royar://auth/callback} return trip from a sign-in that
 * left for the system browser (Google refuses its consent screen inside an
 * embedded WebView). The second is rewritten onto our origin so the OAuth code
 * is exchanged in the WebView's own cookie jar, which is where the PKCE
 * verifier lives.
 */
public class MainActivity extends BridgeActivity {

    private static final String WEB_HOST = "royaraqamia.com";
    private static final String WEB_ORIGIN = "https://" + WEB_HOST;
    private static final String REDIRECT_SCHEME = "royar";

    /**
     * How long the launch skeleton may hold the screen before the document has
     * painted (#498). A dead network must not leave the user looking at
     * placeholders that never resolve, so the skeleton gives up on its own and
     * the WebView's own surface — the error page, or the site's offline shell —
     * takes over.
     */
    private static final long SKELETON_CEILING_MS = 2500;

    /**
     * The skeleton leaves on a fade rather than a cut: a placeholder that
     * disappears in one frame reads as a flash, and the site's own transitions
     * are 150-200ms.
     */
    private static final long SKELETON_FADE_MS = 150;

    /**
     * The launch line the shell's numbers are read from (#499). Debug builds only:
     * Capacitor's logger is silent in a release.
     */
    private static final String LAUNCH_TAG = "RoyLaunch";

    private ShellUpdatePrompt shellUpdate;

    /** The launch skeleton, or null once it has been released. */
    private View skeleton;
    /** Whether the skeleton has started leaving; both release paths share it. */
    private boolean skeletonReleased;

    /** The ceiling, kept as one instance so `onDestroy` can unschedule it. */
    private final Runnable skeletonCeiling = this::releaseSkeleton;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        logLaunch("onCreate");
        // The recitation's bridge (ADR-0086) is this module's own plugin, not an
        // npm package, so it is registered before the bridge is built.
        registerPlugin(QuranPlayerPlugin.class);
        // The launch theme (`AppTheme.NoActionBarLaunch`) declares the platform
        // splash's `windowSplashScreen*` items, and this is what reads them below
        // API 31: `androidx.core:core-splashscreen` draws the same splash there and
        // hands the activity to `postSplashScreenTheme`. It has to run before
        // `super.onCreate`, which is where the starting window is replaced.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        installWebViewSettings(getBridge());
        installLaunchSkeleton();
        openFromIntent(getIntent(), false);
        // Both of these need the bridge, so they run after Capacitor has created
        // it: the shell's version for the page to read, and the update check that
        // may end in a prompt.
        announceShellVersion();
        shellUpdate = new ShellUpdatePrompt(this, getBridge() != null ? getBridge().getServerUrl() : null);
        installUpdateBridge(getBridge());
        shellUpdate.maybeCheck(true);
        // The background drain (ADR-0059): the page signals through the bridge
        // when a flush leaves work behind, and the periodic floor covers what the
        // signal cannot — a shell that was killed before it could ask.
        installSyncBridge(getBridge());
        SyncScheduler.ensurePeriodic(this);
        installBackExit();
    }

    /**
     * The one WebView setting the shell owns (#499).
     *
     * `setOffscreenPreRaster` is what makes the handover from the launch skeleton
     * (#498) a frame of the document rather than a frame of nothing. The skeleton is
     * a view *over* the WebView, so every frame the document produces until the
     * skeleton leaves is produced offscreen — and without this flag the renderer
     * waits for the view to be on screen before it rasterizes anything. Measured on
     * the API 35 emulator the flag changes no commit time (the document is the wait,
     * not the paint); what it changes is that the first frame the user sees after the
     * skeleton is already painted.
     *
     * `cacheMode` is deliberately **not** set. It stays at the platform's
     * `LOAD_DEFAULT`, which is the only mode in which the WebView's HTTP cache
     * revalidates like any other browser cache: a document response carries no
     * private-cache freshness of its own (`public, s-maxage=…` is a shared cache's
     * directive, and the documents ship no `ETag`/`Last-Modified`), so nothing pins a
     * build there, and a `LOAD_CACHE_*` mode would hand the WebView's own copy out
     * before the worker — or the network — is consulted, which is the second cache
     * #499 exists to keep out of the document's path. The authenticated APIs are
     * `no-store` at the transport (`backend/transport/cache-policy.ts`), which is the
     * seam the issue's third acceptance keeps.
     * `scripts/__tests__/webview-settings.test.mjs` fails if either changes.
     */
    private void installWebViewSettings(@Nullable Bridge bridge) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;
        webView.getSettings().setOffscreenPreRaster(true);
    }

    /**
     * Covers the gap between the splash and the document with the app's own
     * chrome (ADR-0061, #498).
     *
     * The skeleton is a view of this activity rather than part of the launch
     * theme, because the launch theme cannot hold one: `windowSplashScreenBackground`
     * is a colour attribute, and the one drawable the splash accepts
     * (`windowSplashScreenAnimatedIcon`) is masked down to a circle two thirds of
     * the area it is drawn in, at a fixed 288dp/240dp. So the cold start is
     * sequenced rather than merged — the theme's wordmark for the first frame, this
     * skeleton for as long as the WebView takes, then the document — and the splash
     * is left to dismiss on the app's first drawn frame, which is the frame this
     * skeleton is in.
     *
     * That last part is measured, not assumed. #498 asked for a
     * `setKeepOnScreenCondition { !pageCommitted }`, and on the API 35 emulator that
     * condition is never read a second time: the splash stays up until the page
     * commits (a cold launch measured 7.5 seconds of splash) and on a dead network
     * it would never lift at all. `SplashScreen` polls the condition from a pre-draw
     * listener on the activity's decor view, and the platform neither traverses nor
     * draws a window that sits behind its starting surface, so a condition that is
     * true in the first frame is never asked again. The platform's own dismissal is
     * already the right edge: it is the first frame the app draws, and this view is
     * in it.
     */
    private void installLaunchSkeleton() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null) return;

        skeleton = getLayoutInflater().inflate(R.layout.shell_skeleton, content, false);
        // Placeholders are not content: nothing here may be announced or focused,
        // and a screen reader that read the card shapes would be reading the app's
        // own loading state as its interface.
        skeleton.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        content.addView(
            skeleton,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        // A launch that never reaches a committed page (radio off, or a document
        // that fails before its first paint) would otherwise leave the skeleton up
        // for as long as the user waited; #498 bounds that at 2.5 seconds.
        skeleton.postDelayed(skeletonCeiling, SKELETON_CEILING_MS);

        Bridge bridge = getBridge();
        if (bridge == null) return;
        bridge.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    // A blank or internal document commits before the site's own
                    // frame does; releasing on that would put the empty surface back
                    // for the rest of the load.
                    if (url == null || url.startsWith("about:")) return;
                    // #499's number: the document's first committed frame, end to
                    // end from the process fork.
                    logLaunch("page committed");
                    releaseSkeleton();
                    // Deferred, because this callback runs inside the bridge's own
                    // iteration over its listener list — removing the listener here
                    // throws `ConcurrentModificationException`, which is what the API
                    // 35 emulator did on the first commit.
                    view.post(() -> bridge.removeWebViewListener(this));
                }
            }
        );
    }

    /**
     * Takes the skeleton off the screen — on the document's first committed frame,
     * or at {@link #SKELETON_CEILING_MS}, whichever comes first. Both paths meet
     * here so the second is a no-op.
     */
    private void releaseSkeleton() {
        if (skeletonReleased) return;
        skeletonReleased = true;
        logLaunch("skeleton released");

        View leaving = skeleton;
        skeleton = null;
        if (leaving == null) return;

        leaving
            .animate()
            .alpha(0f)
            .setDuration(SKELETON_FADE_MS)
            .withEndAction(
                () -> {
                    ViewGroup parent = leaving.getParent() instanceof ViewGroup
                        ? (ViewGroup) leaving.getParent()
                        : null;
                    if (parent != null) parent.removeView(leaving);
                }
            )
            .start();
    }

    /**
     * Writes one launch milestone to logcat, timed from the process fork rather
     * than from any one callback, so the numbers are the launch the user waited
     * through and not a stretch of it.
     *
     * `Process.getStartUptimeMillis()` and `SystemClock.uptimeMillis()` share a
     * base, and an Arabic-locale device is not a factor here: a `long` concatenated
     * onto a string is ASCII digits whatever the device locale is.
     */
    private static void logLaunch(String moment) {
        long elapsed = SystemClock.uptimeMillis() - Process.getStartUptimeMillis();
        Logger.debug(LAUNCH_TAG, moment + " at " + elapsed + "ms");
    }

    /**
     * Lets the system back button close the app once there is nothing left to go
     * back to.
     *
     * Capacitor's App plugin owns the back press (`AppPlugin`, EVENT_BACK_BUTTON):
     * with no page listener it calls `canGoBack()`/`goBack()`, and when the
     * history is exhausted it returns without doing anything — the press is
     * swallowed, so the activity never finishes and Back can never leave the
     * app. This callback is installed after the plugin's (which is registered
     * while the bridge is built, inside `super.onCreate`), and
     * `OnBackPressedDispatcher` offers a press to the most recently added
     * enabled callback first, so this one answers it instead.
     *
     * Walking the WebView's history is kept as it was; only the dead end
     * changes, from "nothing happens" to the task ending — what Android's own
     * root back press does. The history in question is the WebView's: on a
     * System WebView that carries the site's client-side navigations — the
     * behaviour reported on the device that raised this, where Back walked the
     * site page by page and then stopped on the home page — that is the whole
     * of the user's history. On an older WebView it is not: 124 was measured
     * dropping same-document entries, where `canGoBack()` answers false after
     * following a link while the document's own `history.length` is 2 — so
     * there Back ends the task from the page it cannot walk. Nothing in this
     * class can tell the two apart: the page is the only place that knows, and
     * the site's own back control is the in-app way up on those builds.
     *
     * The page's `backButton` event is not fired by this path. That is
     * deliberate: no page code listens for it, and a press that depended on the
     * Capacitor bridge would do nothing at all on a launch where the bridge
     * failed to inject into the remote document (ADR-0043).
     */
    private void installBackExit() {
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    Bridge bridge = getBridge();
                    WebView webView = bridge != null ? bridge.getWebView() : null;
                    if (webView != null && webView.canGoBack()) {
                        webView.goBack();
                        return;
                    }
                    // A bundled shell that has crossed to the live site has no
                    // entry to go back to (issue #500: the remote document
                    // reports `history.length === 1`), so this used to leave the
                    // app from a remote page. Return to the bundled root instead.
                    String bundledRoot = bundledRootFor(bridge, webView);
                    if (bundledRoot != null) {
                        webView.loadUrl(bundledRoot);
                        return;
                    }
                    finish();
                }
            }
        );
    }

    /**
     * The bundled document's root, when the WebView is showing something else of
     * ours and this build serves one (issue #500).
     *
     * Only a build without `server.url` has a bundled document to return to, and
     * only the site's own origin is captured here — anything else (an OAuth page,
     * a link that left the site) keeps the old behaviour of letting the press
     * leave the app. The remote-URL shell that ships today is unchanged: it sets
     * `server.url`, so this answers null and `finish()` runs exactly as before.
     */
    @Nullable
    private String bundledRootFor(@Nullable Bridge bridge, @Nullable WebView webView) {
        if (bridge == null || webView == null) return null;
        if (bridge.getServerUrl() != null) return null;

        String current = webView.getUrl();
        String appUrl = bridge.getAppUrl();
        if (current == null || appUrl == null) return null;
        if (current.startsWith(appUrl)) return null;
        if (!current.startsWith(WEB_ORIGIN)) return null;

        return appUrl.endsWith("/") ? appUrl : appUrl + "/";
    }

    /**
     * Exposes `RoyShellSync.schedule()` to the page.
     *
     * The shell is the only tier that comes back for a queued write once the app is
     * closed, and it has to be *told* the queue is non-empty: the page knows (it
     * just tried to flush), the native side does not. The interface carries no data
     * and cannot touch the queue, so a document in this WebView can do nothing with
     * it beyond asking the shell to drain — and navigation out of our own origin is
     * already what Capacitor's `allowNavigation` refuses.
     */
    private void installSyncBridge(@Nullable Bridge bridge) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        webView.addJavascriptInterface(
            ShellSyncBridge.forApp(() -> SyncScheduler.flushSoon(getApplicationContext())),
            ShellSyncBridge.NAME
        );
    }

    /**
     * Exposes `RoyShellUpdate.required()` to the page (#503).
     *
     * An owned API below the supported floor answers `426`; the page's transport
     * cannot show a native dialog, so it passes the floor here. Like the sync
     * bridge, this is a plain WebView interface rather than a Capacitor plugin,
     * because the plugin bridge is exactly what this path cannot assume.
     */
    private void installUpdateBridge(@Nullable Bridge bridge) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null || shellUpdate == null) return;

        webView.addJavascriptInterface(
            new ShellUpdateBridge(shellUpdate::requireUpdate),
            ShellUpdateBridge.NAME
        );
    }

    /**
     * Withholds the push plugin from a build that cannot serve it.
     *
     * Capacitor resolves its plugin list, and the page's `window.Capacitor.Plugins`, from
     * the bridge this method builds — so a build with no Firebase app has to say so here
     * rather than let the page reach a plugin whose `register()` throws where Capacitor
     * turns it into a fatal crash (ADR-0050, `ShellPlugins`). Newer Capacitor generated
     * this list from `capacitor.plugins.json`; it is rebuilt here only to drop that one
     * entry.
     */
    @Override
    protected void load() {
        if (!BuildConfig.FIREBASE_CONFIGURED) {
            try {
                List<Class<? extends Plugin>> kept = new ArrayList<>();
                for (Class<? extends Plugin> plugin : new PluginManager(getAssets()).loadPluginClasses()) {
                    if (!ShellPlugins.isWithheld(plugin.getName())) {
                        kept.add(plugin);
                    }
                }
                // `setPlugins` replaces the list the bridge builder already has,
                // so a plugin registered in `onCreate` has to be carried over.
                kept.add(QuranPlayerPlugin.class);
                bridgeBuilder.setPlugins(kept);
                Logger.info("No Firebase config in this build: the push plugin is withheld");
            } catch (PluginLoadException ex) {
                // Capacitor logs the same failure and carries on; the plugin list it
                // already read stays in place.
                Logger.error("Could not read capacitor.plugins.json", ex);
            }
        }

        super.load();
    }

    @Override
    public void onResume() {
        super.onResume();
        // A shell that was in the background for a day should have another look;
        // `ShellUpdatePrompt` throttles this to once every few hours. The second
        // call lets an install that was waiting on a permission continue, which is
        // the state the user returns in after granting it.
        if (shellUpdate != null) {
            shellUpdate.maybeCheck(false);
            shellUpdate.resume();
        }
    }

    @Override
    public void onDestroy() {
        if (shellUpdate != null) shellUpdate.shutdown();
        // The ceiling is posted on the skeleton itself; an activity that finishes
        // inside those 2.5 seconds would otherwise keep it, and the callback with
        // it, alive until the delay expired.
        if (skeleton != null) {
            skeleton.removeCallbacks(skeletonCeiling);
            skeleton.animate().cancel();
        }
        super.onDestroy();
    }

    /**
     * Names the shell in the WebView's user agent.
     *
     * The page cannot ask the shell which version it is — on the WebViews this app
     * meets, the Capacitor bridge is not there to ask through (ADR-0043) — so the
     * shell states it where every document can read it. This is what lets the site
     * hold its own prompt back while the shell is asking about its update, and what
     * the account footer reads to show the installed version (ADR-0046).
     *
     * `1.0.3+20003`: the version a user reads, then the counter the update check
     * compares. Both, because the site has to keep working with shells already
     * installed that can only say `20003`.
     */
    private void announceShellVersion() {
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        String userAgent = webView.getSettings().getUserAgentString();
        if (userAgent == null || userAgent.contains(ShellUpdate.USER_AGENT_TOKEN)) return;

        webView.getSettings()
                .setUserAgentString(userAgent + " " + ShellUpdate.USER_AGENT_TOKEN + "/"
                        + BuildConfig.VERSION_NAME + "+" + BuildConfig.VERSION_CODE);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // `setIntent` keeps getIntent() in step, which is what Capacitor's own
        // App plugin reads when it fires `appUrlOpen`.
        setIntent(intent);
        openFromIntent(intent, true);
    }

    private void openFromIntent(@Nullable Intent intent, boolean navigating) {
        String target = webUrlFor(intent != null ? intent.getData() : null);
        if (target == null) return;

        Bridge bridge = getBridge();
        if (bridge == null) return;

        String current = bridge.getWebView() != null ? bridge.getWebView().getUrl() : null;
        // On a cold start Capacitor is already loading the site; only override
        // that when the link points somewhere else.
        if (target.equals(current)) return;
        if (!navigating && target.equals(WEB_ORIGIN + "/")) return;

        bridge.getWebView().loadUrl(target);
    }

    /**
     * The https URL a link should open inside the WebView, or null when the
     * link is not ours. Anything unrecognised is left to Android.
     */
    private String webUrlFor(@Nullable Uri uri) {
        if (uri == null) return null;

        String scheme = uri.getScheme();
        if (scheme == null) return null;

        if (REDIRECT_SCHEME.equals(scheme)) {
            // A custom-scheme URI puts the first segment in the authority, and
            // getPath() excludes it: `royar://auth/callback` has authority "auth"
            // and path "/callback", so the two have to be recombined to reach
            // /auth/callback. Dropping the authority silently truncated the
            // callback path (caught by the on-device deep-link check).
            String authority = uri.getAuthority() != null ? uri.getAuthority() : "";
            String path = uri.getPath() != null ? uri.getPath() : "";
            Uri.Builder rewritten = Uri.parse(WEB_ORIGIN + "/" + authority + path).buildUpon();
            for (String name : uri.getQueryParameterNames()) {
                for (String value : uri.getQueryParameters(name)) {
                    rewritten.appendQueryParameter(name, value);
                }
            }
            return rewritten.build().toString();
        }

        if ("https".equals(scheme) && WEB_HOST.equals(uri.getHost())) {
            return uri.toString();
        }

        return null;
    }
}
