package com.royaraqamia.app.update

import android.app.Activity
import android.provider.Settings
import android.util.Log
import android.widget.Toast
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.R
import com.royaraqamia.app.ShellDownload
import com.royaraqamia.app.ShellInstaller
import com.royaraqamia.app.ShellUpdate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The update check, the download, the verification and the install (#652).
 *
 * What this replaces was the Java `ShellUpdatePrompt`, and the sentence in its
 * header still holds: the prompt is the shell's, not the page's, because the
 * page cannot reach native code reliably on the WebViews the app still meets.
 * What changed is where it is drawn — a Compose card in the app's own frame
 * rather than a `Dialog` inflated from `res/layout` — so the download and the
 * install are the same code they were ([ShellUpdate], [ShellDownload],
 * [ShellInstaller]) and only the announcement moved.
 *
 * The decision itself is not here: [ShellUpdateDecision] answers "which card, if
 * any", and the JVM tests ask it directly. This class is the part that cannot be
 * tested without a device — a check on a timer, a socket, and the platform
 * installer — and it holds its state where the frame can read it.
 *
 * Nothing here installs anything by itself. The platform installer asks the last
 * question, and the file it is handed has already been checked against the size
 * and hash the manifest published.
 */
class ShellUpdateController(
    private val activity: Activity,
    serverUrl: String?,
    private val scope: CoroutineScope,
    private val debug: Boolean = BuildConfig.DEBUG,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** What the frame draws, if anything. */
    var state: ShellUpdateUiState by mutableStateOf(ShellUpdateUiState.Idle)
        private set

    /** Where the manifest lives, or null when the shell has no origin to read it from. */
    private val manifestUrl: String? = serverUrl?.let { ShellUpdate.manifestUrl(it) }

    /** The last manifest answer. Null until one arrives, and then never cleared. */
    private var status: ShellUpdate.Status? = null

    /** The floor a `426` stated, merged into every answer by the decision. */
    private var serverFloor = 0

    private var lastCheckedAt = 0L
    private var lastPercent = -1

    /** An install the user started and the permission gate interrupted. */
    private var waitingForPermission: ShellUpdateCard? = null

    private var downloadJob: Job? = null

    /**
     * «إلغاء» was tapped. Read on the download thread, written on the main one,
     * and the only thing that stops a download (ADR-0054) — see
     * [ShellDownload.Progress].
     */
    @Volatile private var cancelRequested = false

    /**
     * Whether a destination may be handed over to the document (#652, ADR-0114).
     *
     * A build below the floor has a site that will refuse its routes, so the
     * shell keeps the user on its own frame with the blocking card rather than
     * opening a document that answers `426` to everything. An update that is
     * merely offered does not block anything.
     */
    val blocksHandover: Boolean
        get() = ShellUpdateDecision.cardFor(status, floor, debug) is ShellUpdateCard.Required

    private val floor: Int
        get() = maxOf(serverFloor, ShellUpdateChannel.floor)

    /**
     * Reads the manifest and, when it answers, updates the card. `force` is for a
     * fresh launch and for a floor that just arrived; the interval is for a shell
     * that is resumed over and over in one sitting.
     */
    fun maybeCheck(force: Boolean) {
        val url = manifestUrl ?: return
        val now = clock()
        if (!force && now - lastCheckedAt < CHECK_INTERVAL_MS) return
        lastCheckedAt = now

        val installed = BuildConfig.VERSION_CODE
        val seed = deviceSeed()
        scope.launch(Dispatchers.IO) {
            val checked =
                try {
                    ShellUpdate.check(url, installed, seed)
                } catch (error: Exception) {
                    // Offline, or the manifest is not published yet: not an event.
                    Log.w(TAG, "check failed for $url: $error")
                    return@launch
                }
            Log.i(
                TAG,
                "checked $url: installed=" +
                    "${checked.installedCode} latest=${checked.latestCode} " +
                    "rollout=${checked.rollout} pending=${checked.updatePending()}",
            )
            withContext(Dispatchers.Main) {
                status = checked
                publish()
            }
        }
    }

    /**
     * A server stated a floor (#503): the native half of the typed `426`.
     *
     * Merged before the manifest is re-read, so the blocking card appears at once
     * rather than up to six hours later, and the re-read is what turns the floor
     * into an installable APK — a floor with no manifest behind it is a card with
     * nothing to install.
     */
    fun requireUpdate(minimumVersionCode: Int) {
        if (minimumVersionCode <= 0) return
        serverFloor = maxOf(serverFloor, minimumVersionCode)
        publish()
        maybeCheck(true)
    }

    /**
     * Called when the shell comes back to the foreground. An install that was
     * waiting on the "install unknown apps" setting gets to continue here — but
     * the drill measured that this usually cannot happen: granting that setting
     * restarts the app, so the parked install goes with the process and the card
     * simply comes back. Kept because the restart is the platform's behaviour
     * rather than a contract.
     */
    fun resume() {
        val card = waitingForPermission ?: return
        if (!ShellInstaller.canInstall(activity)) return
        waitingForPermission = null
        download(card)
    }

    /** The frame is gone: nothing may start another read or another download. */
    fun shutdown() {
        downloadJob?.cancel()
        downloadJob = null
    }

    /** «تنزيل وتثبيت»: the gate the platform requires, then the download. */
    fun install() {
        val card = (state as? ShellUpdateUiState.Asking)?.card ?: return
        startInstall(card)
    }

    /** «إعادة المحاولة»: the same card, a second attempt at the same file. */
    fun retry() {
        val card = (state as? ShellUpdateUiState.Failed)?.card ?: return
        startInstall(card)
    }

    /** «لاحقًا»: a real answer, remembered until the next launch or check. */
    fun decline() {
        state = ShellUpdateUiState.Idle
    }

    /**
     * «إلغاء»: the only way out of a download in progress (ADR-0054).
     *
     * The bytes stop at the next read rather than instantly — `InputStream.read`
     * on an `HttpURLConnection` is not interruptible — so the card keeps saying so
     * and the button goes inert instead of looking broken.
     */
    fun cancelDownload() {
        cancelRequested = true
    }

    private fun publish() {
        // A download in flight is never replaced by an answer that arrived while it
        // ran: the file being verified is the file named by the card on screen.
        if (state is ShellUpdateUiState.Downloading) return
        val card = ShellUpdateDecision.cardFor(status, floor, debug)
        state = if (card == null) ShellUpdateUiState.Idle else ShellUpdateUiState.Asking(card)
    }

    private fun startInstall(card: ShellUpdateCard) {
        if (!ShellInstaller.canInstall(activity)) {
            // Android 8 makes this a per-app permission only the user can grant, so
            // the install is parked rather than failed; `resume` picks it up.
            waitingForPermission = card
            Toast.makeText(activity, R.string.shell_update_allow_installs, Toast.LENGTH_LONG).show()
            ShellInstaller.requestPermission(activity)
            return
        }
        download(card)
    }

    /**
     * The download, the verification, and the hand-over to the platform installer,
     * in that order — and none of them on the main thread.
     *
     * Every write to [state] below is on the main thread except the progress
     * callback, which runs on the thread reading the socket: Compose's snapshot
     * state is safe to write from there, and posting a percentage to the main
     * thread would queue one message per read of the socket instead.
     */
    private fun download(card: ShellUpdateCard) {
        cancelRequested = false
        lastPercent = -1
        state = ShellUpdateUiState.Downloading(card, 0, card.status.sizeBytes)

        downloadJob =
            scope.launch(Dispatchers.IO) {
                val apk =
                    try {
                        ShellInstaller.fetch(activity, card.status) { received, total ->
                            onProgress(card, received, total)
                        }
                    } catch (stopped: ShellDownload.Cancelled) {
                        // Not a failure: the user said no, and `ShellDownload` has
                        // already deleted the partial file on its way out. The offer
                        // comes back on the next launch or check rather than
                        // immediately, because "إلغاء" is an answer.
                        Log.i(TAG, "the download was cancelled: ${stopped.message}")
                        withContext(Dispatchers.Main) { state = ShellUpdateUiState.Idle }
                        return@launch
                    } catch (error: ShellDownload.VerificationFailed) {
                        Log.w(TAG, "the update did not verify: ${error.message}")
                        withContext(Dispatchers.Main) {
                            state = ShellUpdateUiState.Failed(card, ShellUpdateFailure.Verify)
                        }
                        return@launch
                    } catch (stopped: CancellationException) {
                        // The frame is gone. Not a failure of the download, and
                        // not a state anyone is left looking at.
                        throw stopped
                    } catch (error: Exception) {
                        Log.w(TAG, "the update could not be downloaded: $error")
                        withContext(Dispatchers.Main) {
                            state = ShellUpdateUiState.Failed(card, ShellUpdateFailure.Download)
                        }
                        return@launch
                    }

                Log.i(TAG, "verified ${apk.name} (${apk.length()} bytes) against the manifest")
                withContext(Dispatchers.Main) {
                    try {
                        ShellInstaller.offer(activity, apk)
                        state = ShellUpdateUiState.Idle
                    } catch (error: Exception) {
                        // Nothing was installed; the file is fine, opening the
                        // installer on it is what failed.
                        Log.w(TAG, "nothing can install $apk: $error")
                        state = ShellUpdateUiState.Failed(card, ShellUpdateFailure.NoInstaller)
                    }
                }
            }
    }

    /**
     * Reported from the download thread, so this only publishes whole percentages.
     *
     * The throw is the cancel. It is checked before anything else and before the
     * "nothing changed" early return, because a percentage that has not moved is
     * exactly what a stalled download looks like, and that is when a user taps
     * «إلغاء».
     */
    private fun onProgress(card: ShellUpdateCard, received: Long, total: Long) {
        if (cancelRequested) {
            throw ShellDownload.Cancelled("cancelled at $received of $total bytes")
        }
        if (total <= 0) return
        val percent = minOf(100L, received * 100L / total).toInt()
        if (percent == lastPercent) return
        lastPercent = percent
        state = ShellUpdateUiState.Downloading(card, received, total)
    }

    /**
     * The stable per-device seed a staged rollout is bucketed by ([ShellUpdate]).
     * The Android ID survives app updates on the same signing key, and `null` (or
     * a platform that refuses to read it) still buckets deterministically rather
     * than opting the device out.
     */
    private fun deviceSeed(): String =
        try {
            Settings.Secure.getString(activity.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        } catch (error: Exception) {
            Log.w(TAG, "cannot read the device id for the rollout bucket: $error")
            ""
        }

    private companion object {
        const val TAG = "ShellUpdater"

        /** Often enough to hear about a release, rarely enough not to nag. */
        const val CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L
    }
}
