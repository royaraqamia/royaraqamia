package com.royaraqamia.app.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp

/**
 * The spacing tokens, resolved for one window width (ADR-0089).
 *
 * Every value is a fluid step, so a screen asks for `section` and gets the floor
 * on a phone and the ceiling on a tablet, the same way the stylesheet's `clamp()`
 * does. Naming the step rather than the number is what keeps a gap and its padding
 * in the same relationship on both clients.
 */
@Immutable
data class RoySpacing(
    val section: Dp,
    val sectionSm: Dp,
    val containerPadding: Dp,
    val cardPadding: Dp,
    val elementGap: Dp,
    val elementGapSm: Dp,
)

/** The spacing scale at a window [widthDp], from the generated tokens. */
fun roySpacing(widthDp: Float): RoySpacing =
    RoySpacing(
        section =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.sectionMin,
                DesignTokens.Spacing.sectionPreferred,
                DesignTokens.Spacing.sectionMax,
            ),
        sectionSm =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.sectionSmMin,
                DesignTokens.Spacing.sectionSmPreferred,
                DesignTokens.Spacing.sectionSmMax,
            ),
        containerPadding =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.containerPaddingMin,
                DesignTokens.Spacing.containerPaddingPreferred,
                DesignTokens.Spacing.containerPaddingMax,
            ),
        cardPadding =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.cardPaddingMin,
                DesignTokens.Spacing.cardPaddingPreferred,
                DesignTokens.Spacing.cardPaddingMax,
            ),
        elementGap =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.elementGapMin,
                DesignTokens.Spacing.elementGapPreferred,
                DesignTokens.Spacing.elementGapMax,
            ),
        elementGapSm =
            fluidDp(
                widthDp,
                DesignTokens.Spacing.elementGapSmMin,
                DesignTokens.Spacing.elementGapSmPreferred,
                DesignTokens.Spacing.elementGapSmMax,
            ),
    )
