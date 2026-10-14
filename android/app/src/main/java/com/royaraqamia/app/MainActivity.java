package com.royaraqamia.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.annotation.Nullable;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

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
        super.onCreate(savedInstanceState);
        openFromIntent(getIntent(), false);
        // Both of these need the bridge, so they run after Capacitor has created
        // it: the shell's version for the page to read, and the update check that
        // may end in a prompt.
        announceShellVersion();
        shellUpdate = new ShellUpdatePrompt(this, getBridge() != null ? getBridge().getServerUrl() : null);
        shellUpdate.maybeCheck(true);
    }

    @Override
    public void onResume() {
        super.onResume();
        // A shell that was in the background for a day should have another look;
        // `ShellUpdatePrompt` throttles this to once every few hours.
        if (shellUpdate != null) shellUpdate.maybeCheck(false);
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
     * hold its own prompt back while the shell is asking about its update.
     */
    private void announceShellVersion() {
        Bridge bridge = getBridge();
        WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) return;

        String userAgent = webView.getSettings().getUserAgentString();
        if (userAgent == null || userAgent.contains(ShellUpdate.USER_AGENT_TOKEN)) return;

        webView.getSettings()
                .setUserAgentString(userAgent + " " + ShellUpdate.USER_AGENT_TOKEN + "/" + BuildConfig.VERSION_CODE);
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
