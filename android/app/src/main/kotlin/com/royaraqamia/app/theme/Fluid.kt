package com.royaraqamia.app.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * A CSS `clamp(min, preferred vw, max)` resolved at a window [widthDp].
 *
 * The token file writes a fluid step as those three numbers and the stylesheet
 * hands them to `clamp()`; the app multiplies the same slope by the window's
 * width, which is the viewport CSS measures. A step therefore changes at the same
 * widths in both clients, rather than at two breakpoints chosen here.
 */
fun fluidDp(widthDp: Float, min: Float, preferredVw: Float, max: Float): Dp =
    (widthDp * preferredVw / 100f).coerceIn(min, max).dp

/** [fluidDp] for a type step, which is measured in sp. */
fun fluidSp(widthDp: Float, min: Float, preferredVw: Float, max: Float): TextUnit =
    (widthDp * preferredVw / 100f).coerceIn(min, max).sp
