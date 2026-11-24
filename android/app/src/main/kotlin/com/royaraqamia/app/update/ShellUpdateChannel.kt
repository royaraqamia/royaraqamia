package com.royaraqamia.app.update

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * What the page has told the shell about updates (#503, #652).
 *
 * The floor is the server's word; the offer request is the member's own tap on
 * the account checker. Neither draws a card — the shell re-reads its manifest for
 * that — but both have to reach the frame from a WebView interface thread.
 *
 * Two servers say "this build is too old", and only one of them has a view:
 *
 * - the manifest beside the site, which the shell reads on its own every few
 *   hours and before it hands a destination over;
 * - an owned API, which answers a typed `426` to whichever screen asked
 *   ([ShellUpdateRequired]).
 *
 * A screen cannot draw the card — the shell owns it — so the `426`'s answer is
 * published here and merged into every manifest read
 * ([ShellUpdateDecision.cardFor]). It is Compose state because the frame that
 * draws the card observes it, and it is one object because the answer may arrive
 * from a WebView interface thread ([com.royaraqamia.app.MainActivity]) or from an
 * API client on any coroutine.
 *
 * It never goes down. A floor is the newest thing the server has said about this
 * build; an older answer arriving later is not evidence that the build became
 * supported again, and an update that raises it is the APK's own versionCode.
 */
object ShellUpdateChannel {
    /** The floor this process has heard, or 0 while nothing has stated one. */
    var floor: Int by mutableStateOf(0)
        private set

    /**
     * How many times the page has asked for the dismissable offer, or 0 while it
     * never has. A counter rather than a flag so a second tap is a second request
     * even though the first one is still remembered; the frame observes it and
     * re-reads its manifest, the same way it observes [floor].
     */
    var offerRequests: Long by mutableStateOf(0L)
        private set

    /**
     * Records the floor a server stated. `0` — what a browser-side caller sends
     * when it has no number — is not a floor and changes nothing.
     */
    @JvmStatic
    fun require(minimumVersionCode: Int) {
        if (minimumVersionCode <= 0) return
        if (minimumVersionCode > floor) floor = minimumVersionCode
    }

    /**
     * The account checker asked for the offer. No number is involved: the shell
     * still reads its own manifest, and a page cannot raise the floor by asking.
     */
    @JvmStatic
    fun requestOffer() {
        offerRequests++
    }
}
