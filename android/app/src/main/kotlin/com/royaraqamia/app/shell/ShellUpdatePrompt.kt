package com.royaraqamia.app.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.royaraqamia.app.R
import com.royaraqamia.app.ShellUpdate
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors
import com.royaraqamia.app.update.ShellUpdateCard
import com.royaraqamia.app.update.ShellUpdateFailure
import com.royaraqamia.app.update.ShellUpdateUiState

/**
 * The shell's update card, drawn where the app draws its own chrome (#652).
 *
 * It replaces a `Dialog` inflated from `res/layout/dialog_shell_update*.xml`, and
 * the three cards it drew are still the three states here: an offer, the same
 * offer as a floor that cannot be declined, and the report that a download did
 * not arrive. Three of ADR-0054's choices carry over verbatim, because they were
 * measured rather than preferred — the text is centred over full-width actions,
 * the primary sits above the secondary, and the download is not dismissable by
 * back or by an outside tap while «إلغاء» is the one honest exit.
 *
 * What is new is the line the card adds about the release itself: `notes` from
 * `latest.json`, which the release train fills with the Arabic sentence a user
 * reads (ADR-0090). Before this, the card said only that something exists.
 *
 * Everything is the site's own design: the card is [Recipes.Card], the primary
 * action is [Recipes.Cta] — the gradient pill the site gives a gesture that costs
 * something — and the glyphs are generated, not redrawn (ADR-0099, ADR-0100).
 * The numbers take the read-only digit face through [digitRuns], which is the
 * Compose half of what `DigitSpans` did for the layouts this replaces.
 */
@Composable
fun ShellUpdatePrompt(
    state: ShellUpdateUiState,
    onInstall: () -> Unit,
    onRetry: () -> Unit,
    onLater: () -> Unit,
    onCancelDownload: () -> Unit,
) {
    when (state) {
        ShellUpdateUiState.Idle -> Unit
        is ShellUpdateUiState.Asking ->
            OfferCard(card = state.card, onInstall = onInstall, onLater = onLater)
        is ShellUpdateUiState.Downloading ->
            DownloadCard(state = state, onCancel = onCancelDownload)
        is ShellUpdateUiState.Failed ->
            FailedCard(state = state, onRetry = onRetry, onLater = onLater)
    }
}

/** The offer — and, below a floor, the same card with nothing to decline. */
@Composable
private fun OfferCard(card: ShellUpdateCard, onInstall: () -> Unit, onLater: () -> Unit) {
    val required = card is ShellUpdateCard.Required
    // A floor has nothing to decline: the site refuses this build's routes, so the
    // card is the way forward rather than a question. An offer can always be put off.
    CardDialog(dismissable = !required, onDismiss = onLater) {
        Headline(
            stringResource(
                if (required) R.string.shell_update_required_title else R.string.shell_update_title
            )
        )
        Message(
            stringResource(
                if (required) R.string.shell_update_required_message
                else R.string.shell_update_message
            )
        )
        Description(status = card.status)
        Note(note = card.status.notes)
        PrimaryAction(
            label = stringResource(R.string.shell_update_install),
            onClick = onInstall,
        )
        if (!required) {
            SecondaryAction(label = stringResource(R.string.shell_update_later), onClick = onLater)
        }
    }
}

/**
 * The download, on screen, with the one way out of it (ADR-0054).
 *
 * Not cancelable by back or by an outside tap: the file is being written and the
 * installer runs the moment it verifies. «إلغاء» says it, stops the bytes at the
 * next read, and leaves nothing behind — which is why the button says «جاري
 * الإلغاء…» and goes inert rather than looking dead the moment it is tapped.
 */
@Composable
private fun DownloadCard(state: ShellUpdateUiState.Downloading, onCancel: () -> Unit) {
    var cancelling by remember { mutableStateOf(false) }
    val type = LocalRoyTypeScale.current
    val fraction =
        if (state.total > 0) (state.received.toFloat() / state.total.toFloat()).coerceIn(0f, 1f)
        else 0f
    val percent = (fraction * 100f).toInt()

    CardDialog(dismissable = false, onDismiss = {}) {
        Headline(stringResource(R.string.shell_update_downloading))

        // The brand's gradient on a track one step up from the card. RTL is what
        // makes it fill from the right; the 3dp radius is half the bar's height, so
        // the track reads as a capsule.
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(BAR_HEIGHT)
                    .clip(RoundedCornerShape(BAR_HEIGHT / 2))
                    .background(RoyColors.muted)
        ) {
            Box(
                modifier =
                    Modifier.fillMaxWidth(fraction)
                        .fillMaxHeight()
                        .background(Brush.horizontalGradient(Recipes.Cta.stops))
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text =
                    digitRuns(stringResource(R.string.shell_update_percent, percent.toString())),
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.primary,
            )
            if (state.total > 0) {
                Text(
                    text =
                        digitRuns(
                            stringResource(
                                R.string.shell_update_progress_size,
                                ShellUpdate.formatSize(state.received),
                                ShellUpdate.formatSize(state.total),
                            )
                        ),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        SecondaryAction(
            label =
                stringResource(
                    if (cancelling) R.string.shell_update_cancelling
                    else R.string.shell_update_cancel
                ),
            enabled = !cancelling,
            onClick = {
                // The download stops at the next read rather than instantly, so the
                // button says so and goes inert instead of looking broken.
                cancelling = true
                onCancel()
            },
        )
    }
}

/**
 * The failed download, in the card that reported it rather than as a toast.
 *
 * What the user is deciding is unchanged, and a toast floats away while the thing
 * it is about comes back — so the reason it failed sits where the download was,
 * with «إعادة المحاولة» where «تنزيل وتثبيت» was. The versions and the size say
 * nothing about why a download failed, so they are not repeated here.
 */
@Composable
private fun FailedCard(state: ShellUpdateUiState.Failed, onRetry: () -> Unit, onLater: () -> Unit) {
    CardDialog(dismissable = true, onDismiss = onLater) {
        Headline(stringResource(R.string.shell_update_failed_title))
        Message(stringResource(reasonOf(state.reason)))
        PrimaryAction(label = stringResource(R.string.shell_update_retry), onClick = onRetry)
        SecondaryAction(label = stringResource(R.string.shell_update_later), onClick = onLater)
    }
}

/** The card itself: the site's surface, radius, border and padding, in one place. */
@Composable
private fun CardDialog(
    dismissable: Boolean,
    onDismiss: () -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    val spacing = LocalRoySpacing.current
    Dialog(
        onDismissRequest = { if (dismissable) onDismiss() },
        properties =
            DialogProperties(
                dismissOnBackPress = dismissable,
                dismissOnClickOutside = dismissable,
            ),
    ) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.card,
            border = Recipes.Card.border,
            modifier = Modifier.fillMaxWidth(DIALOG_WIDTH_FRACTION),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                content = content,
            )
        }
    }
}

@Composable
private fun Headline(text: String) {
    val type = LocalRoyTypeScale.current
    Text(
        text = text,
        style = type.h6.copy(fontWeight = FontWeight.Bold),
        color = RoyColors.foreground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun Message(text: String) {
    val type = LocalRoyTypeScale.current
    Text(
        text = text,
        style = type.small,
        color = RoyColors.mutedForeground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * «تحديث من 1.0.2 إلى 1.0.4 · 7.1 م.ب».
 *
 * Either half may be missing and either may stand alone — a manifest published by
 * hand can leave out `versionName` or `sizeBytes`, and a card with no version and
 * no size is still a card worth showing, while an empty row is not.
 */
@Composable
private fun Description(status: ShellUpdate.Status) {
    val type = LocalRoyTypeScale.current
    val installed = com.royaraqamia.app.BuildConfig.VERSION_NAME
    val parts = buildList {
        if (installed.isNotEmpty() && status.versionName.isNotEmpty()) {
            add(stringResource(R.string.shell_update_meta, installed, status.versionName))
        }
        if (status.sizeBytes > 0) {
            add(stringResource(R.string.shell_update_size, ShellUpdate.formatSize(status.sizeBytes)))
        }
    }
    if (parts.isEmpty()) return

    Text(
        text = digitRuns(parts.joinToString(SEPARATOR)),
        style = type.xs,
        color = RoyColors.mutedForeground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * What the release carries: `latest.json`'s `notes`, the one sentence the release
 * train wrote for a user to read (ADR-0090).
 *
 * Absent for a manifest that names none — a hand-published manifest does — and an
 * empty label with nothing under it would be worse than no label.
 */
@Composable
private fun Note(note: String) {
    if (note.isBlank()) return
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = LucideVectors.FileText,
            contentDescription = null,
            tint = RoyColors.primary,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Column(verticalArrangement = Arrangement.spacedBy(Recipes.Row.gap)) {
            Text(
                text = stringResource(R.string.shell_update_notes_label),
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            Text(text = note, style = type.xs, color = RoyColors.mutedForeground)
        }
    }
}

/** The site's primary action: the gradient pill, full width on a card this narrow. */
@Composable
private fun PrimaryAction(label: String, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .height(Recipes.Cta.height)
                .shadow(
                    elevation = Recipes.Cta.bloomY,
                    shape = Recipes.Cta.radius,
                    ambientColor = Recipes.Cta.bloom,
                    spotColor = Recipes.Cta.bloom,
                )
                .clip(Recipes.Cta.radius)
                .background(Brush.horizontalGradient(Recipes.Cta.stops))
                .border(Recipes.Cta.border, Recipes.Cta.radius)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = Recipes.Cta.paddingX),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = label, style = Recipes.Cta.text(type), color = Recipes.Cta.content)
    }
}

/** The quiet action: the label carries it, with no fill and no edge. */
@Composable
private fun SecondaryAction(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    TextButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(ACTION_HEIGHT),
    ) {
        Text(
            text = label,
            style = type.small,
            color =
                if (enabled) RoyColors.mutedForeground
                else RoyColors.mutedForeground.copy(alpha = 0.6f),
        )
    }
}

/** The reason a download did not end in an install, in the site's words. */
private fun reasonOf(reason: ShellUpdateFailure): Int =
    when (reason) {
        ShellUpdateFailure.Download -> R.string.shell_update_download_failed
        ShellUpdateFailure.Verify -> R.string.shell_update_verify_failed
        ShellUpdateFailure.NoInstaller -> R.string.shell_update_no_installer
    }

/**
 * [text] with every numeric run in the read-only digit face.
 *
 * The face is a digit-only subset, so it is applied to the numbers and never to
 * the sentence around them — the Arabic stays in the UI face, which is what the
 * stylesheet's `unicode-range: U+30-39` achieves on the site and what `DigitSpans`
 * did for the layouts this replaces (ADR-0054). Which runs are numbers is
 * [digitRunsOf], which is pure and tested on the JVM.
 */
@Composable
private fun digitRuns(text: String): AnnotatedString = remember(text) {
    buildAnnotatedString {
        var last = 0
        for (run in digitRunsOf(text)) {
            append(text.substring(last, run.first))
            withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Normal)) {
                append(text.substring(run.first, run.last + 1))
            }
            last = run.last + 1
        }
        append(text.substring(last))
    }
}

/** The height a tactile action needs, in the layout the site's dialogs use. */
private val ACTION_HEIGHT = 48.dp

/** The download bar's height, and half of it is its capsule radius. */
private val BAR_HEIGHT = 6.dp

/** The width a card stops at, as a fraction, before the site's gutter is what is left. */
private const val DIALOG_WIDTH_FRACTION = 0.94f

/** What separates the version range from the size, as the site's `·`. */
private const val SEPARATOR = " · "
