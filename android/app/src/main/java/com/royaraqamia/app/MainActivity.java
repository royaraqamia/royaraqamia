package com.royaraqamia.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
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

    private ShellUpdatePrompt shellUpdate;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        // The launch theme (`AppTheme.NoActionBarLaunch`) declares the platform
        // splash's `windowSplashScreen*` items, and this is what reads them below
        // API 31: `androidx.core:core-splashscreen` draws the same splash there and
        // hands the activity to `postSplashScreenTheme`. It has to run before
        // `super.onCreate`, which is where the starting window is replaced.
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        openFromIntent(getIntent(), false);
        // Both of these need the bridge, so they run after Capacitor has created
        // it: the shell's version for the page to read, and the update check that
        // may end in a prompt.
        announceShellVersion();
        shellUpdate = new ShellUpdatePrompt(this, getBridge() != null ? getBridge().getServerUrl() : null);
        shellUpdate.maybeCheck(true);
        // The background drain (ADR-0059): the page signals through the bridge
        // when a flush leaves work behind, and the periodic floor covers what the
        // signal cannot — a shell that was killed before it could ask.
        installSyncBridge(getBridge());
        SyncScheduler.ensurePeriodic(this);
        installBackExit();
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
                    finish();
                }
            }
        );
    }

    /**
     * Exposes `RoyShellSync.schedule()` and `lastFlush()` to the page.
     *
     * The shell is the only tier that comes back for a queued write once the app is
     * closed, and it has to be *told* the queue is non-empty: the page knows (it
     * just tried to flush), the native side does not. The interface carries no data
     * and cannot touch the queue, so a document in this WebView can do nothing with
     * it beyond asking the shell to drain — and navigation out of our own origin is
     * already what Capacitor's `allowNavigation` refuses. `lastFlush()` reads back
     * the record the worker persisted (#455), so `/device` can name what the shell
     * delivered while nobody was looking.
     */
    private void installSyncBridge(@Nullable Bridge bridge) {
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        webView.addJavascriptInterface(
            ShellSyncBridge.forApp(
                () -> SyncScheduler.flushSoon(getApplicationContext()),
                // #455: the last drain the worker persisted, for `/device` to read.
                () -> SyncFlushRecord.load(getApplicationContext())
            ),
            ShellSyncBridge.NAME
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
