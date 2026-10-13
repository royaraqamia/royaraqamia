package com.royaraqamia.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

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

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openFromIntent(getIntent(), false);
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
