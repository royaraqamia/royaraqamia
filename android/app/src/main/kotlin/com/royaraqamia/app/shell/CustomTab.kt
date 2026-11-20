package com.royaraqamia.app.shell

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log

/**
 * The system browser as one screen (#661).
 *
 * The escape hatch opens a surface outside the app process: the system browser
 * draws the live page, the app stays underneath, and closing the tab returns the
 * member to it. It is a Custom Tab rather than a plain tab so the browser keeps
 * the site's own colour and the app's chrome is not hidden behind a second
 * application frame.
 *
 * The extras are spelled here rather than through `androidx.browser`: the app
 * declares no dependency it does not draw with, and the two keys below are the
 * stable contract every Custom Tab provider reads. A browser that does not speak
 * them still opens the URL as an ordinary tab, which is the same destination.
 */
object CustomTab {
    /** The session key: its presence is what asks a browser for a Custom Tab. */
    const val EXTRA_SESSION = "android.support.customtabs.extra.SESSION"

    /** Whether a supporting browser may also warm Instant Apps for this URL. */
    const val EXTRA_ENABLE_INSTANT_APPS =
        "android.support.customtabs.extra.EXTRA_ENABLE_INSTANT_APPS"

    /**
     * The intent that opens [url] on top of the app.
     *
     * One action and the extras, because everything else — which browser, its
     * process, its task — belongs to the platform. The caller keeps the route it
     * was on, so a back from the browsing surface lands where the member was.
     */
    fun intentFor(url: String): Intent {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        // A null binder is the documented "no service connection": the browser
        // still draws a Custom Tab, it just cannot call back into the app, which
        // this hand-off does not need.
        val extras = Bundle()
        extras.putBinder(EXTRA_SESSION, null)
        intent.putExtras(extras)
        intent.putExtra(EXTRA_ENABLE_INSTANT_APPS, true)
        return intent
    }

    /** Opens [url] on the system browser, leaving the app underneath. */
    fun open(context: Context, url: String) {
        // A device with no browser at all is a device the app cannot escape to;
        // refusing to crash is the whole point of an escape hatch.
        try {
            context.startActivity(intentFor(url))
        } catch (error: Exception) {
            Log.w(TAG, "cannot open $url in the browser: $error")
        }
    }

    private const val TAG = "BrowserEscape"
}
