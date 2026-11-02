package com.royaraqamia.app.shell

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.royaraqamia.app.MainActivity

/**
 * The hand-off: a route opened in the document (#647, #872).
 *
 * ADR-0105 records why this exists at all. The shell is the launcher and draws the
 * first frame; the destination itself is the Capacitor activity at that exact
 * route, on our own origin, so the surface the user asked for is the site's own
 * rather than a second drawing of it. Since #872 the hand-off is the rule for
 * every route, not the exception for the ones the frame cannot draw.
 *
 * It is one call, it is the only place in `shell/` that names the document
 * activity, and it is deleted with that activity if #662 ever lands.
 */
object WebSurface {
    /**
     * The intent that opens [target] in the document, leaving the shell underneath.
     *
     * Exposed as an intent rather than only as a call because the shell launches it
     * *for result*: the document finishing is the one back that leaves the app
     * (`ShellActivity`), and a plain `startActivity` cannot hear that.
     */
    fun intentFor(context: Context, target: String): Intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(DeepLink.webUrl(target)))
            .setClass(context, MainActivity::class.java)
            // The document is one activity for every route: a second hand-off
            // from the shell reuses it rather than stacking another copy of the
            // same screen behind the same frame.
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)

    /** Opens [target] in the document, leaving the shell underneath it. */
    fun open(context: Context, target: String) {
        context.startActivity(intentFor(context, target))
    }
}
