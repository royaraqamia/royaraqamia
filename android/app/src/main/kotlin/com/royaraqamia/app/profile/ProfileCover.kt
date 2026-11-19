package com.royaraqamia.app.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.ProfileCoverPalettes
import com.royaraqamia.app.theme.RoyColors
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** The band's geometry, shared with the profile header that sinks the avatar into it. */
object ProfileCoverMetrics {
    const val HEIGHT_DP: Int = 132
    const val WIDE_HEIGHT_DP: Int = 160
    const val WIDE_AT_DP: Int = 640
    const val AVATAR_SIZE_DP: Int = 80
    const val AVATAR_SINK_DP: Int = 40

    fun height(width: Dp): Dp = if (width >= WIDE_AT_DP.dp) WIDE_HEIGHT_DP.dp else HEIGHT_DP.dp

    /** Where the identity starts: the band's lower edge less the sunk half-avatar. */
    fun contentTop(width: Dp): Dp = height(width) - AVATAR_SINK_DP.dp
}

/**
 * The seeded band a member's identity is drawn on (ADR-0201).
 *
 * Decorative only: no words, no image, no content description, and nothing that
 * means something by colour alone. The page names the same box with
 * [ProfileCoverCopy.TAG], so a later visual gate can find both sides.
 *
 * The four paint layers are `cover-wash-a`, `cover-wash-b`, `cover-sweep` and
 * `cover-vignette` in `app/theme.css`, read with [ProfileCoverLook]'s placement
 * and [ProfileCoverPalettes]' generated pair. The inset shadow and the hairline
 * under the band are the page's `box-shadow` and `border-b`.
 */
@Composable
fun ProfileCover(memberId: String, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier = modifier.fillMaxWidth().testTag(ProfileCoverCopy.TAG)) {
        val bandHeight = ProfileCoverMetrics.height(maxWidth)
        val (washA, washB) = ProfileCoverPalettes.PAIRS[ProfileCoverLook.palette(memberId)]
        val (orbX, orbY) = ProfileCoverLook.placement(memberId)

        Box(
            Modifier.fillMaxWidth()
                .height(bandHeight)
                .coverRadial(
                    centerX = orbX,
                    centerY = -0.10f,
                    radiusX = 1.50f,
                    radiusY = 2.10f,
                    stops =
                        arrayOf(
                            0.00f to washA.copy(alpha = 0.54f),
                            0.44f to washA.copy(alpha = 0.22f),
                            0.82f to Color.Transparent,
                        ),
                )
                .coverRadial(
                    centerX = orbY,
                    centerY = -0.06f,
                    radiusX = 1.10f,
                    radiusY = 1.70f,
                    stops =
                        arrayOf(
                            0.00f to washB.copy(alpha = 0.44f),
                            0.38f to washB.copy(alpha = 0.15f),
                            0.72f to Color.Transparent,
                        ),
                )
                .coverSweep()
                .coverRadial(
                    centerX = 0.50f,
                    centerY = 1.28f,
                    radiusX = 1.30f,
                    radiusY = 1.20f,
                    stops =
                        arrayOf(
                            0.00f to Color.Black.copy(alpha = 0.55f),
                            0.62f to Color.Transparent,
                        ),
                )
                .coverInset()
        )
    }
}

/**
 * An elliptical CSS radial gradient: scale a unit circle by the band's own
 * width and height, then move it to the CSS centre. The stops are the ones the
 * stylesheet names, so a hue change cannot live only in Kotlin.
 */
private fun Modifier.coverRadial(
    centerX: Float,
    centerY: Float,
    radiusX: Float,
    radiusY: Float,
    stops: Array<Pair<Float, Color>>,
): Modifier =
    drawBehind {
        translate(left = size.width * centerX, top = size.height * centerY) {
            scale(
                scaleX = size.width * radiusX,
                scaleY = size.height * radiusY,
                pivot = Offset.Zero,
            ) {
                drawCircle(
                    brush = Brush.radialGradient(colorStops = stops, center = Offset.Zero, radius = 1f),
                    center = Offset.Zero,
                    radius = 1f,
                )
            }
        }
    }

/** The page's 118deg white 5.5% sweep, blended with the washes underneath. */
private fun Modifier.coverSweep(): Modifier =
    drawBehind {
        val radians = 118.0 * PI / 180.0
        val dx = sin(radians).toFloat()
        val dy = -cos(radians).toFloat()
        val length = abs(size.width * dx) + abs(size.height * dy)
        val centre = Offset(size.width / 2f, size.height / 2f)
        val half = Offset(dx * length / 2f, dy * length / 2f)
        drawRect(
            brush =
                Brush.linearGradient(
                    colorStops =
                        arrayOf(
                            0.26f to Color.Transparent,
                            0.46f to Color.White.copy(alpha = 0.055f),
                            0.66f to Color.Transparent,
                        ),
                    start = centre - half,
                    end = centre + half,
                ),
            blendMode = BlendMode.Screen,
        )
    }

/** `inset 0 -24dp 30dp -22dp rgba(0,0,0,0.75)` and the 1dp border under the band. */
private fun Modifier.coverInset(): Modifier =
    drawBehind {
        val shadowTop = size.height - 24.dp.toPx()
        drawRect(
            brush =
                Brush.verticalGradient(
                    colors = listOf(Color.Transparent, Color.Black.copy(alpha = 0.75f)),
                    startY = shadowTop,
                    endY = size.height,
                ),
            topLeft = Offset(0f, shadowTop),
            size = Size(size.width, size.height - shadowTop),
        )
        drawRect(
            color = RoyColors.border.copy(alpha = 0.35f),
            topLeft = Offset(0f, size.height - 1.dp.toPx()),
            size = Size(size.width, 1.dp.toPx()),
        )
    }
