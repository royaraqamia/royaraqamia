package com.royaraqamia.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;

import androidx.annotation.Nullable;

import java.util.List;

/**
 * The account page's view of Android's input-method state (ADR-0219).
 *
 * A normal app cannot silently make an IME the default, so this interface does
 * two honest things: it reads what Android reports, and it opens the system's
 * settings or picker for the member to choose. It never writes a secure setting.
 * No typed text crosses it — booleans and user gestures only (ADR-0220) — and it
 * is a plain `addJavascriptInterface` object like the update and sync bridges,
 * not a Capacitor plugin the remote document may never receive (ADR-0043).
 */
final class ShellKeyboardBridge {

    /** The name the page reads the interface from. Also the page's name for it. */
    static final String NAME = "RoyShellKeyboard";

    /**
     * The service class from the vendored `:keyboard` module. The package is ours,
     * so the {@link ComponentName} is built from the context rather than carrying
     * a second copy of the application id.
     */
    private static final String IME_SERVICE = "dev.patrickgold.florisboard.FlorisImeService";

    /** The pinned FlorisBoard v0.5.2 engine declares API 26 as its floor. */
    private static final int IME_MIN_SDK = 26;

    private final Context context;
    private final Handler main = new Handler(Looper.getMainLooper());

    ShellKeyboardBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    private ComponentName ime() {
        return new ComponentName(context, IME_SERVICE);
    }

    private @Nullable InputMethodManager inputMethods() {
        Object service = context.getSystemService(Context.INPUT_METHOD_SERVICE);
        return service instanceof InputMethodManager ? (InputMethodManager) service : null;
    }

    private boolean listed(@Nullable List<InputMethodInfo> methods) {
        if (methods == null) return false;
        String id = ime().flattenToString();
        for (InputMethodInfo method : methods) {
            if (id.equals(method.getId())) return true;
        }
        return false;
    }

    /** The IME is installed in this APK and this Android can run it. */
    @JavascriptInterface
    public boolean available() {
        if (Build.VERSION.SDK_INT < IME_MIN_SDK) return false;
        InputMethodManager manager = inputMethods();
        return manager != null && listed(manager.getInputMethodList());
    }

    /** Android has enabled our IME, whether or not it is the default. */
    @JavascriptInterface
    public boolean enabled() {
        if (Build.VERSION.SDK_INT < IME_MIN_SDK) return false;
        InputMethodManager manager = inputMethods();
        return manager != null && listed(manager.getEnabledInputMethodList());
    }

    /** The system's chosen IME is ours — read only, never set here. */
    @JavascriptInterface
    public boolean isDefault() {
        if (Build.VERSION.SDK_INT < IME_MIN_SDK) return false;
        String current = Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.DEFAULT_INPUT_METHOD
        );
        return ime().flattenToString().equals(current);
    }

    /** Opens Android's input-method settings, where our IME can be enabled. */
    @JavascriptInterface
    public void openSettings() {
        Intent settings = new Intent(Settings.ACTION_INPUT_METHOD_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(settings);
        } catch (ActivityNotFoundException ignored) {
            // No settings activity on this device: the page keeps its current row.
        }
    }

    /** Opens the picker; the member, not the app, makes the switch. */
    @JavascriptInterface
    public void openPicker() {
        // JavascriptInterface methods run on the WebView's JavaBridge thread;
        // the system UI belongs on the main thread.
        main.post(
            () -> {
                InputMethodManager manager = inputMethods();
                if (manager != null) manager.showInputMethodPicker();
            }
        );
    }
}
