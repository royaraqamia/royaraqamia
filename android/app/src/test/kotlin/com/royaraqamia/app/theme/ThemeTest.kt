package com.royaraqamia.app.theme

import androidx.compose.foundation.shape.CornerSize
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * The theme, held to the token source.
 *
 * Every value here is one a hand edit could quietly change: a hex pasted into the
 * scheme, a size typed as `24.sp` instead of the token, a corner measured from
 * nothing. The generated files cannot drift - `npm run check:tokens` compares them
 * byte for byte - so what is pinned here is the part that is written by hand, which
 * is the mapping from a token to the role it fills.
 */
class ThemeTest {

    @Test
    fun `the scheme fills its roles from the tokens`() {
        val scheme = royColorScheme()

        assertEquals(color(DesignTokens.Colors.primary), scheme.primary)
        assertEquals(color(DesignTokens.Colors.primaryForeground), scheme.onPrimary)
        assertEquals(color(DesignTokens.Colors.selected), scheme.primaryContainer)
        assertEquals(color(DesignTokens.Colors.secondary), scheme.secondary)
        assertEquals(color(DesignTokens.Colors.background), scheme.background)
        assertEquals(color(DesignTokens.Colors.foreground), scheme.onBackground)
        assertEquals(color(DesignTokens.Colors.card), scheme.surface)
        assertEquals(color(DesignTokens.Colors.cardForeground), scheme.onSurface)
        assertEquals(color(DesignTokens.Colors.muted), scheme.surfaceVariant)
        assertEquals(color(DesignTokens.Colors.mutedForeground), scheme.onSurfaceVariant)
        assertEquals(color(DesignTokens.Colors.destructive), scheme.error)
        assertEquals(color(DesignTokens.Colors.border), scheme.outline)
    }

    @Test
    fun `the surface ladder is the sites own four steps`() {
        val scheme = royColorScheme()

        assertEquals(color(DesignTokens.Colors.background), scheme.surfaceContainerLowest)
        assertEquals(color(DesignTokens.Colors.card), scheme.surfaceContainerLow)
        assertEquals(color(DesignTokens.Colors.popover), scheme.surfaceContainerHigh)
        assertEquals(color(DesignTokens.Colors.muted), scheme.surfaceContainerHighest)
    }

    @Test
    fun `generated colours are the tokens in Compose's type`() {
        // `RoyColors` is generated, so this is what would catch a generator that
        // stopped reading `DesignTokens` and started writing literals.
        assertEquals(color(DesignTokens.Colors.primary), RoyColors.primary)
        assertEquals(color(DesignTokens.Colors.background), RoyColors.background)
        assertEquals(color(DesignTokens.Colors.accentPurple), RoyColors.accentPurple)
    }

    @Test
    fun `a fluid step clamps the way the stylesheet does`() {
        // `h1` is `clamp(2rem, 5vw, 4rem)` in the token source.
        assertEquals(32f.sp, fluidSp(320f, 32f, 5f, 64f))
        assertEquals(40f.sp, fluidSp(800f, 32f, 5f, 64f))
        assertEquals(64f.sp, fluidSp(1280f, 32f, 5f, 64f))
        assertEquals(64f.sp, fluidSp(2000f, 32f, 5f, 64f))

        // `--section-spacing` is `clamp(3.75rem, 8vw, 6rem)`.
        assertEquals(60f.dp, fluidDp(320f, 60f, 8f, 96f))
        assertEquals(64f.dp, fluidDp(800f, 60f, 8f, 96f))
        assertEquals(96f.dp, fluidDp(1280f, 60f, 8f, 96f))
    }

    @Test
    fun `the type scale is the tokens at every step`() {
        val phone = royTypeScale(320f)
        assertEquals(DesignTokens.TypeScale.H1.sizeMin.sp, phone.h1.fontSize)
        assertEquals(FontWeight(DesignTokens.TypeScale.H1.weight), phone.h1.fontWeight)
        assertEquals(DesignTokens.TypeScale.H1.lineHeight * 32f, phone.h1.lineHeight.value, 0.001f)

        val tablet = royTypeScale(1280f)
        assertEquals(DesignTokens.TypeScale.H1.sizeMax.sp, tablet.h1.fontSize)
        assertEquals(DesignTokens.TypeScale.Body.sizeMax.sp, tablet.body.fontSize)

        // Every step is the UI face: the site sets headings in `--font-sans` and
        // keeps Aref Ruqaa for the opt-in display class and the digits.
        assertEquals(RoyFonts.ui, tablet.h1.fontFamily)
        assertEquals(RoyFonts.ui, tablet.body.fontFamily)
        assertEquals(RoyFonts.ui, tablet.xs.fontFamily)
    }

    @Test
    fun `letter spacing keeps its em`() {
        val h1 = royTypeScale(320f).h1
        assertEquals(DesignTokens.TypeScale.H1.letterSpacingEm.em, h1.letterSpacing)
    }

    @Test
    fun `the spacing steps are the tokens`() {
        val phone = roySpacing(320f)
        assertEquals(DesignTokens.Spacing.sectionMin.dp, phone.section)
        assertEquals(DesignTokens.Spacing.containerPaddingMin.dp, phone.containerPadding)
        assertEquals(DesignTokens.Spacing.elementGapSmMin.dp, phone.elementGapSm)

        val tablet = roySpacing(1280f)
        assertEquals(DesignTokens.Spacing.sectionMax.dp, tablet.section)
        assertEquals(DesignTokens.Spacing.containerPaddingMax.dp, tablet.containerPadding)
        assertEquals(DesignTokens.Spacing.elementGapSmMax.dp, tablet.elementGapSm)
    }

    @Test
    fun `the corners follow the one radius`() {
        val shapes = royShapes()
        val base = DesignTokens.Radii.base

        assertEquals(CornerSize((base - 4f).dp), shapes.extraSmall.topStart)
        assertEquals(CornerSize((base - 2f).dp), shapes.small.topStart)
        assertEquals(CornerSize(base.dp), shapes.medium.topStart)
        assertEquals(CornerSize((base + 4f).dp), shapes.large.topStart)
    }

    @Test
    fun `the digit helper swaps the face and nothing else`() {
        val scale = royTypeScale(320f)
        val digits = scale.digits(scale.body)

        assertEquals(RoyFonts.digits, digits.fontFamily)
        assertEquals(FontWeight.Normal, digits.fontWeight)
        assertEquals(scale.body.fontSize, digits.fontSize)
        assertEquals(scale.body.lineHeight, digits.lineHeight)
        assertNotEquals(scale.body.fontFamily, digits.fontFamily)
    }

    @Test
    fun `material roles sit on the sites steps`() {
        val scale = royTypeScale(320f)
        val material = royTypography(scale)

        assertEquals(scale.h1, material.displayLarge)
        assertEquals(scale.h3, material.displaySmall)
        assertEquals(scale.h5, material.titleLarge)
        assertEquals(scale.body, material.bodyLarge)
        assertEquals(scale.xs, material.labelSmall)
    }

    private fun color(argb: Long): Color = Color(argb.toInt())
}
