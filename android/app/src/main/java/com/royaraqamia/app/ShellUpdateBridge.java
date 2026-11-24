package com.royaraqamia.app;

import android.webkit.JavascriptInterface;

/**
 * The page's one way to ask the shell to show its update card (#503).
 *
 * A below-floor owned API answers `426` with the minimum counter, and the page's
 * transport hands that number here. The account's update checker can also ask for
 * the dismissable offer without a floor. Neither path installs anything: both only
 * signal the app's update channel
 * ({@link com.royaraqamia.app.update.ShellUpdateChannel}), and the shell re-reads
 * its own manifest before it draws a card.
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
    private final Runnable offerer;

    ShellUpdateBridge(Requester requester, Runnable offerer) {
        this.requester = requester;
        this.offerer = offerer;
    }

    @JavascriptInterface
    public void required(int minimumVersionCode) {
        requester.required(minimumVersionCode);
    }

    /**
     * The account checker found a release and asked for the dismissable card.
     *
     * No floor and no APK details travel here: the shell re-reads its own manifest
     * so a page cannot turn an offer into a forced update, and an old WebView that
     * never calls this keeps the shell's launch check as its only prompt.
     */
    @JavascriptInterface
    public void offer() {
        offerer.run();
    }
}
