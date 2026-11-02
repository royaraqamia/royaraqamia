package com.royaraqamia.app.update

import com.royaraqamia.app.ShellUpdate

/**
 * The card the shell is drawing about an update (#652, ADR-0114).
 *
 * Two things can be said: a newer APK is published, which the user may decline,
 * or this build is below the floor the site states, which has one answer. Which
 * of the two — and whether anything is said at all — is [ShellUpdateDecision]'s
 * single question, kept pure so the JVM tests beside the manifest's own
 * (`ShellUpdateTest`) can ask it without a device.
 */
sealed interface ShellUpdateCard {
    /** The manifest answer this card is about, with the server's floor merged in. */
    val status: ShellUpdate.Status

    /** A newer APK than the installed one, offered rather than required. */
    data class Offer(override val status: ShellUpdate.Status) : ShellUpdateCard

    /**
     * The installed build is below the floor. The site refuses its routes, so the
     * card cannot be declined and the frame does not hand a destination over
     * while it stands ([com.royaraqamia.app.shell.ShellActivity.handOver]).
     */
    data class Required(override val status: ShellUpdate.Status) : ShellUpdateCard
}

/**
 * Why a download did not end in an install.
 *
 * The words live in `res/values/strings.xml` rather than beside this type: the
 * card is the app's alone (`shell/ShellUpdatePrompt.kt`), so there is no second client to
 * drift from and nothing for `shared/copy` to keep in step.
 */
enum class ShellUpdateFailure {
    /** The bytes never arrived, or the connection died mid-file. */
    Download,

    /** The file arrived and is not the file the manifest named. */
    Verify,

    /** The file verified and this device has nothing that will install it. */
    NoInstaller,
}

/** Everything the update card can be, as one value the frame draws. */
sealed interface ShellUpdateUiState {
    /** Nothing to say: nothing has answered yet, or there is nothing to install. */
    data object Idle : ShellUpdateUiState

    /** A card is up, waiting on the user. */
    data class Asking(val card: ShellUpdateCard) : ShellUpdateUiState

    /** The APK is arriving; [total] is the size the manifest published. */
    data class Downloading(
        val card: ShellUpdateCard,
        val received: Long,
        val total: Long,
    ) : ShellUpdateUiState

    /** The download did not end in an install, and the card says why. */
    data class Failed(val card: ShellUpdateCard, val reason: ShellUpdateFailure) :
        ShellUpdateUiState
}

/**
 * Which card — if any — a manifest answer asks for (#652).
 *
 * Pure, and the whole of the decision: everything else in the update path is
 * either a read or a view. The rules are the ones ADR-0043 established and this
 * issue kept:
 *
 * - **Silence is the default.** No answer yet, an equal or older release, or a
 *   release this device is not in the rollout cohort of all mean "say nothing".
 * - **A floor is absolute.** A build below it gets the blocking card even when
 *   no newer APK is offered to this device, because the site refuses its routes
 *   anyway — that is the whole point of a floor, and it is why the rollout does
 *   not moderate it.
 * - **`floor` is the server's word, not the manifest's.** A `426` can arrive
 *   before `latest.json` names the new floor ([ShellUpdateChannel]); merging it
 *   here is what stops a lagging manifest from answering "nothing to do".
 * - **Nothing is offered that could not be installed.** An `apkUrl` the app will
 *   not fetch is not made safe by a card, so an uninstallable manifest reads as
 *   silence: the safe direction is a working app, never an install we refuse.
 */
object ShellUpdateDecision {
    @JvmStatic
    fun cardFor(status: ShellUpdate.Status?, floor: Int, debug: Boolean): ShellUpdateCard? {
        if (status == null) return null
        val merged = status.withMinimumSupportedCode(if (floor > 0) floor else 0)
        if (!ShellUpdate.isAllowedUpdateUrl(merged.apkUrl, debug)) return null
        return when {
            merged.unsupported() -> ShellUpdateCard.Required(merged)
            merged.updatePending() -> ShellUpdateCard.Offer(merged)
            else -> null
        }
    }
}
