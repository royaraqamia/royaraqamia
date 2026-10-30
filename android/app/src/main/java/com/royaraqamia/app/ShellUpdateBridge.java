package com.royaraqamia.app;

import android.webkit.JavascriptInterface;

/**
 * The page's one way to ask the shell to show its update card (#503).
 *
 * A below-floor owned API answers `426` with the minimum counter, and the page's
 * transport hands that number here. The shell owns the dialog and the installer,
 * so this interface carries no data and cannot install anything by itself: it only
 * tells {@link ShellUpdatePrompt} that the server has refused this build.
 *
 * It is a plain `addJavascriptInterface` object, like the sync bridge (ADR-0059),
 * rather than a Capacitor plugin: the plugin bridge is not reliably injected into
 * the remote document on the WebViews the shell still meets (ADR-0043), and this is
 * the path that must work on exactly those devices.
 */
final class ShellUpdateBridge {

    /** The name the page reads the interface from. Also the page's name for it. */
    static final String NAME = "RoyShellUpdate";

    interface Requester {
        void required(int minimumVersionCode);
    }

    private final Requester requester;

    ShellUpdateBridge(Requester requester) {
        this.requester = requester;
    }

    @JavascriptInterface
    public void required(int minimumVersionCode) {
        requester.required(minimumVersionCode);
    }
}
