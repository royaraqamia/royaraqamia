package com.royaraqamia.app.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import com.royaraqamia.app.R

/** The faces the app bundles, and the only ones a screen may name. */
object RoyFonts {
    /**
     * IBM Plex Sans Arabic. Every heading, paragraph and label is set in it: the
     * site's headings name `--font-sans` too, and Aref Ruqaa is the opt-in display
     * face rather than the default one.
     */
    val ui =
        FontFamily(
            Font(R.font.ibm_plex_sans_arabic_regular, FontWeight.Normal),
            Font(R.font.ibm_plex_sans_arabic_bold, FontWeight.Bold),
        )

    /**
     * Aref Ruqaa, the face read-only numbers take (`--font-digits`).
     *
     * `res/font/aref_ruqaa_digits.ttf` is a digit-only subset, so this family is
     * the subset *and* the UI face behind it: a count arrives as `1,200`, and the
     * comma is not in the subset at all. The stylesheet gets the same result from
     * `unicode-range: U+30-39`, which lets the comma fall through to `--font-sans`;
     * Compose has no `unicode-range`, so the fallback is the family's second font
     * and the platform's own font resolution does the rest.
     *
     * Apply it through [RoyTypeScale.digits] to a run that is only numerals and
     * their separators, never to a whole sentence: the Arabic around a number stays
     * in [ui], which is the point of the subset.
     */
    val digits = FontFamily(Font(R.font.aref_ruqaa_digits), Font(R.font.ibm_plex_sans_arabic_regular))
}

/**
 * The site's type scale, resolved for one window width (ADR-0089).
 *
 * The steps are the stylesheet's own (`h1` through `xs`), not Material's fifteen
 * roles, because the site is the reference the app is measured against. Material's
 * roles are filled from these in [royTypography].
 */
@Immutable
data class RoyTypeScale(
    val h1: TextStyle,
    val h2: TextStyle,
    val h3: TextStyle,
    val h4: TextStyle,
    val h5: TextStyle,
    val h6: TextStyle,
    val body: TextStyle,
    val small: TextStyle,
    val xs: TextStyle,
) {
    /**
     * [style] in the digit face, for a string that is only ASCII numerals.
     *
     * The weight goes back to normal because the subset is cut from the bold face:
     * asking for bold would have the platform embolden an already bold outline.
     */
    fun digits(style: TextStyle): TextStyle =
        style.copy(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Normal)
}

/** One step of the fluid scale: floor, slope and ceiling, in the units Compose reads. */
private fun step(
    widthDp: Float,
    min: Float,
    preferredVw: Float,
    max: Float,
    weight: Int,
    lineHeight: Float,
    letterSpacingEm: Float = 0f,
): TextStyle {
    val size = fluidSp(widthDp, min, preferredVw, max)
    return TextStyle(
        fontFamily = RoyFonts.ui,
        fontWeight = FontWeight(weight),
        fontSize = size,
        lineHeight = size * lineHeight,
        letterSpacing = letterSpacingEm.em,
    )
}

/** The stylesheet's scale at a window [widthDp], from the generated tokens. */
fun royTypeScale(widthDp: Float): RoyTypeScale =
    RoyTypeScale(
        h1 =
            step(
                widthDp,
                DesignTokens.TypeScale.H1.sizeMin,
                DesignTokens.TypeScale.H1.sizePreferred,
                DesignTokens.TypeScale.H1.sizeMax,
                DesignTokens.TypeScale.H1.weight,
                DesignTokens.TypeScale.H1.lineHeight,
                DesignTokens.TypeScale.H1.letterSpacingEm,
            ),
        h2 =
            step(
                widthDp,
                DesignTokens.TypeScale.H2.sizeMin,
                DesignTokens.TypeScale.H2.sizePreferred,
                DesignTokens.TypeScale.H2.sizeMax,
                DesignTokens.TypeScale.H2.weight,
                DesignTokens.TypeScale.H2.lineHeight,
                DesignTokens.TypeScale.H2.letterSpacingEm,
            ),
        h3 =
            step(
                widthDp,
                DesignTokens.TypeScale.H3.sizeMin,
                DesignTokens.TypeScale.H3.sizePreferred,
                DesignTokens.TypeScale.H3.sizeMax,
                DesignTokens.TypeScale.H3.weight,
                DesignTokens.TypeScale.H3.lineHeight,
            ),
        h4 =
            step(
                widthDp,
                DesignTokens.TypeScale.H4.sizeMin,
                DesignTokens.TypeScale.H4.sizePreferred,
                DesignTokens.TypeScale.H4.sizeMax,
                DesignTokens.TypeScale.H4.weight,
                DesignTokens.TypeScale.H4.lineHeight,
            ),
        h5 =
            step(
                widthDp,
                DesignTokens.TypeScale.H5.sizeMin,
                DesignTokens.TypeScale.H5.sizePreferred,
                DesignTokens.TypeScale.H5.sizeMax,
                DesignTokens.TypeScale.H5.weight,
                DesignTokens.TypeScale.H5.lineHeight,
            ),
        h6 =
            step(
                widthDp,
                DesignTokens.TypeScale.H6.sizeMin,
                DesignTokens.TypeScale.H6.sizePreferred,
                DesignTokens.TypeScale.H6.sizeMax,
                DesignTokens.TypeScale.H6.weight,
                DesignTokens.TypeScale.H6.lineHeight,
            ),
        body =
            step(
                widthDp,
                DesignTokens.TypeScale.Body.sizeMin,
                DesignTokens.TypeScale.Body.sizePreferred,
                DesignTokens.TypeScale.Body.sizeMax,
                DesignTokens.TypeScale.Body.weight,
                DesignTokens.TypeScale.Body.lineHeight,
            ),
        // The two smallest steps carry no weight in the source: the stylesheet sets
        // `font-size` and `line-height` only, so they inherit body weight.
        small =
            step(
                widthDp,
                DesignTokens.TypeScale.Small.sizeMin,
                DesignTokens.TypeScale.Small.sizePreferred,
                DesignTokens.TypeScale.Small.sizeMax,
                FontWeight.Normal.weight,
                DesignTokens.TypeScale.Small.lineHeight,
            ),
        xs =
            step(
                widthDp,
                DesignTokens.TypeScale.Xs.sizeMin,
                DesignTokens.TypeScale.Xs.sizePreferred,
                DesignTokens.TypeScale.Xs.sizeMax,
                FontWeight.Normal.weight,
                DesignTokens.TypeScale.Xs.lineHeight,
            ),
    )

/**
 * Material's type roles, filled from the site's [scale].
 *
 * The mapping is deliberately short of one-to-one: Material has fifteen roles and
 * the site nine steps, and a screen that wants a paragraph, a card title or a
 * button label is asking for one of those nine. `display` is the site's largest
 * heading on a phone and `labelSmall` its smallest caption, so a component styled
 * by Material defaults sits on the same scale as a hand-set screen.
 */
fun royTypography(scale: RoyTypeScale): Typography =
    Typography(
        displayLarge = scale.h1,
        displayMedium = scale.h2,
        displaySmall = scale.h3,
        headlineLarge = scale.h3,
        headlineMedium = scale.h4,
        headlineSmall = scale.h5,
        titleLarge = scale.h5,
        titleMedium = scale.h6,
        titleSmall = scale.small,
        bodyLarge = scale.body,
        bodyMedium = scale.small,
        bodySmall = scale.xs,
        labelLarge = scale.small,
        labelMedium = scale.xs,
        labelSmall = scale.xs,
    )
