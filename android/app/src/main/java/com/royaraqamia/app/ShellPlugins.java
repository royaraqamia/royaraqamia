package com.royaraqamia.app;

/**
 * Which Capacitor plugins this build hands to the page.
 *
 * `cap sync` writes every plugin into `capacitor.plugins.json`, Capacitor registers them
 * all, and then publishes each one into `window.Capacitor.Plugins` — which is what the site
 * reads (`frontend/shared/native-shell.ts`) instead of importing the plugin packages, so
 * the plugin list is also the page's list. Withholding a plugin here is therefore how the
 * shell says "this build cannot run that": the page sees no plugin, degrades to web
 * behaviour, and reports it (ADR-0050).
 *
 * Push is the plugin that has to be withheld. `@capacitor/push-notifications` calls
 * `FirebaseMessaging` natively, and on a build with no Firebase app that throws
 * `IllegalStateException` — which Capacitor catches only to rethrow on its own
 * `CapacitorPlugins` thread (`Bridge.callPluginMethod`, Bridge.java:854-856). That is a
 * fatal crash, not a rejected promise: nothing in JavaScript can catch it, so the
 * notification bell's mount path (an existing FCM token is healed on open, so it calls
 * `register()` without a tap) killed the process the moment the panel opened.
 */
final class ShellPlugins {

    /**
     * `@capacitor/push-notifications`' plugin class, as `cap sync` writes it into
     * `capacitor.plugins.json` (`classpath`). `ShellPluginsTest` holds this constant to
     * that committed file, so renaming the class fails a JVM test rather than quietly
     * re-arming the crash.
     */
    static final String PUSH_NOTIFICATIONS_CLASS =
        "com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin";

    private ShellPlugins() {}

    /**
     * Whether this plugin must not be registered, because the build cannot serve it.
     *
     * Only ever called for a build with no Firebase config; a build that carries one serves
     * push for real and withholds nothing.
     */
    static boolean isWithheld(String classPath) {
        return PUSH_NOTIFICATIONS_CLASS.equals(classPath);
    }
}
