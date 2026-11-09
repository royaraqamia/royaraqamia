package com.royaraqamia.app.quran

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The recitation's controls on the reader, as the page draws them (#956).
 *
 * It is one view over the service: play and pause, the stop that ends the
 * recitation, the Ayah being played and the progress through the sura. The
 * service owns the queue, the notification and the sound when the screen is off;
 * nothing here creates a player of its own.
 *
 * The words are [QuranPlayerCopy], from the same file the site's float reads, so
 * a label cannot be right on one client and wrong on the other.
 */
@Composable
fun QuranPlayerPanel(
    face: QuranPlayerFace,
    onPrimary: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current

    Column(
        modifier =
            modifier
                .testTag(QuranPlayerMetrics.PANEL)
                .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (face is QuranPlayerFace.Offline || face is QuranPlayerFace.Failed) {
            Text(
                text =
                    if (face is QuranPlayerFace.Offline) QuranPlayerCopy.OFFLINE
                    else QuranPlayerCopy.ERROR,
                modifier =
                    Modifier.widthIn(max = 256.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(RoyColors.card)
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                        .testTag(QuranPlayerMetrics.MESSAGE),
                color = RoyColors.destructive,
                style = type.xs,
            )
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (face is QuranPlayerFace.Playing || face is QuranPlayerFace.Paused) {
                Box(
                    modifier =
                        Modifier.size(44.dp)
                            .clip(CircleShape)
                            .background(RoyColors.card)
                            .border(1.dp, RoyColors.border.copy(alpha = 0.7f), CircleShape)
                            .clickable(role = Role.Button, onClick = onStop)
                            .semantics { contentDescription = QuranPlayerCopy.STOP }
                            .testTag(QuranPlayerMetrics.STOP),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = LucideVectors.Square,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }

            QuranPrimaryButton(face = face, onClick = onPrimary)
        }

        val playing = face as? QuranPlayerFace.Playing
        val paused = face as? QuranPlayerFace.Paused
        val ayah = playing?.ayah ?: paused?.ayah
        val ayahCount = playing?.ayahCount ?: paused?.ayahCount
        val position = playing?.positionSeconds ?: paused?.positionSeconds
        val duration = playing?.durationSeconds ?: paused?.durationSeconds

        if (ayah != null && ayahCount != null) {
            Text(
                text =
                    buildAnnotatedString {
                        append(QuranPlayerCopy.AYAH_LABEL + " ")
                        withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Normal)) {
                            append(ayah.toString())
                        }
                        append(" " + QuranPlayerCopy.OF_LABEL + " ")
                        withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Normal)) {
                            append(ayahCount.toString())
                        }
                    },
                modifier =
                    Modifier.testTag(QuranPlayerMetrics.COUNTER)
                        .clip(RoundedCornerShape(50))
                        .background(RoyColors.card)
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(50))
                        .padding(horizontal = 12.dp, vertical = 4.dp)
                        .semantics { liveRegion = LiveRegionMode.Polite },
                color = RoyColors.mutedForeground,
                style = type.xs,
            )
        }

        if (position != null && duration != null && duration > 0) {
            Box(
                modifier =
                    Modifier.width(QuranPlayerMetrics.trackWidth)
                        .height(2.dp)
                        .clip(RoundedCornerShape(50))
                        .background(RoyColors.muted),
            ) {
                Box(
                    modifier =
                        Modifier.fillMaxWidth((position / duration).toFloat().coerceIn(0f, 1f))
                            .height(2.dp)
                            .background(RoyColors.primary),
                )
            }
        }

        if (playing?.savedComplete == true || paused?.savedComplete == true) {
            Row(
                modifier =
                    Modifier.clip(RoundedCornerShape(50))
                        .background(RoyColors.card)
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(50))
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    tint = RoyColors.primary,
                    modifier = Modifier.size(12.dp),
                )
                Text(
                    text = QuranPlayerCopy.SAVED_COMPLETE,
                    color = RoyColors.primary,
                    style = type.xs,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun QuranPrimaryButton(face: QuranPlayerFace, onClick: () -> Unit) {
    val label =
        when (face) {
            QuranPlayerFace.Idle -> QuranPlayerCopy.LISTEN
            QuranPlayerFace.Loading -> QuranPlayerCopy.LOADING
            is QuranPlayerFace.Playing -> QuranPlayerCopy.PAUSE
            is QuranPlayerFace.Paused -> QuranPlayerCopy.RESUME
            QuranPlayerFace.Offline,
            QuranPlayerFace.Failed,
            -> QuranPlayerCopy.RETRY
        }

    Box(
        modifier =
            Modifier.size(56.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            QuranPlayerMetrics.buttonStart,
                            QuranPlayerMetrics.buttonMiddle,
                            QuranPlayerMetrics.buttonEnd,
                        )
                    )
                )
                .clickable(
                    enabled = face !is QuranPlayerFace.Loading,
                    role = Role.Button,
                    onClick = onClick,
                )
                .semantics { contentDescription = label }
                .testTag(QuranPlayerMetrics.PRIMARY),
        contentAlignment = Alignment.Center,
    ) {
        when (face) {
            QuranPlayerFace.Idle -> PlayGlyph()
            QuranPlayerFace.Loading -> LoadingGlyph()
            is QuranPlayerFace.Playing -> PauseGlyph()
            is QuranPlayerFace.Paused -> PlayGlyph()
            QuranPlayerFace.Offline,
            QuranPlayerFace.Failed,
            -> Icon(
                imageVector = LucideVectors.TriangleAlert,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

@Composable
private fun PlayGlyph() {
    Icon(
        imageVector = LucideVectors.Play,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.size(24.dp),
    )
}

@Composable
private fun PauseGlyph() {
    Icon(
        imageVector = LucideVectors.Pause,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.size(24.dp),
    )
}

@Composable
private fun LoadingGlyph() {
    val transition = rememberInfiniteTransition(label = "quran-player-loading")
    val angle by
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec =
                infiniteRepeatable(
                    animation = tween(durationMillis = 900, easing = LinearEasing),
                    repeatMode = RepeatMode.Restart,
                ),
            label = "quran-player-loading-angle",
        )
    Icon(
        imageVector = LucideVectors.LoaderCircle,
        contentDescription = null,
        tint = Color.White,
        modifier = Modifier.size(22.dp).rotate(angle),
    )
}

/** The tags a UI test finds the panel by, and the page's button gradient. */
internal object QuranPlayerMetrics {
    const val PANEL = "quran-player"
    const val PRIMARY = "quran-player-primary"
    const val STOP = "quran-player-stop"
    const val COUNTER = "quran-player-counter"
    const val MESSAGE = "quran-player-message"

    val trackWidth = 180.dp

    val buttonStart = Color(0xFF9333EA)
    val buttonMiddle = Color(0xFF7C3AED)
    val buttonEnd = Color(0xFF4F46E5)
}
