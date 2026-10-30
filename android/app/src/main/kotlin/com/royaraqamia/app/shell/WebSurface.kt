package com.royaraqamia.app.shell

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.royaraqamia.app.MainActivity

/**
 * The hand-off: a route the shell cannot draw itself, opened in the document (#647).
 *
 * ADR-0105 records why this exists at all. The shell is the launcher and draws the
 * first frame; a destination whose surface is still the site's opens the Capacitor
 * activity at that exact route, on our own origin, so the surface the user asked
 * for is the one they get instead of a placeholder.
 *
 * It is one call, it is the only place in `shell/` that names the document
 * activity, and it is deleted with that activity in #662.
 */
object WebSurface {
    /** Opens [target] in the document, leaving the shell underneath it. */
    fun open(context: Context, target: String) {
        val intent =
            Intent(Intent.ACTION_VIEW, Uri.parse(DeepLink.webUrl(target)))
                .setClass(context, MainActivity::class.java)
                // The document is one activity for every route: a second hand-off
                // from the shell reuses it rather than stacking another copy of
                // the same screen behind the same frame.
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
        context.startActivity(intent)
    }
}
