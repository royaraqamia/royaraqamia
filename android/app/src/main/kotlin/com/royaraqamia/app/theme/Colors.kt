package com.royaraqamia.app.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme

/**
 * Material 3's colour scheme, built from the token palette (ADR-0089).
 *
 * The values themselves are generated ([RoyColors]); this file is the one place
 * that decides *which* token fills which role, because that is a design decision
 * rather than a mechanical copy. Every role is filled from the token that means
 * the same thing on the site, so a Material component and the web component it
 * stands in for agree about what "secondary" is.
 *
 * Material has more roles than the palette has names. The surface ladder is the
 * site's own four steps in order - `background`, `card`, `popover`, `muted` -
 * assigned from the dimmest up, so a Card and a Menu sit on the surface the site
 * gives them instead of on Material's default tint. A role with no token behind it
 * is left at the scheme's default rather than invented here; a component that
 * reaches for one is the signal that the palette needs another name, and that is a
 * token change rather than a colour written in this file.
 */
fun royColorScheme(): ColorScheme =
    darkColorScheme(
        primary = RoyColors.primary,
        onPrimary = RoyColors.primaryForeground,
        // The site's filled selection state (segmented controls, filter chips): darker
        // than the accent so a white label on it clears AA (#148).
        primaryContainer = RoyColors.selected,
        onPrimaryContainer = RoyColors.selectedForeground,
        inversePrimary = RoyColors.primary,
        secondary = RoyColors.secondary,
        onSecondary = RoyColors.secondaryForeground,
        secondaryContainer = RoyColors.accent,
        onSecondaryContainer = RoyColors.accentForeground,
        // The third hue family the site draws with: info is blue, the accents are indigo
        // and purple, and both are already used as fills elsewhere.
        tertiary = RoyColors.info,
        onTertiary = RoyColors.infoForeground,
        tertiaryContainer = RoyColors.accentIndigo,
        onTertiaryContainer = RoyColors.accentIndigoForeground,
        background = RoyColors.background,
        onBackground = RoyColors.foreground,
        surface = RoyColors.card,
        onSurface = RoyColors.cardForeground,
        surfaceVariant = RoyColors.muted,
        onSurfaceVariant = RoyColors.mutedForeground,
        surfaceTint = RoyColors.primary,
        inverseSurface = RoyColors.foreground,
        inverseOnSurface = RoyColors.background,
        error = RoyColors.destructive,
        onError = RoyColors.destructiveForeground,
        outline = RoyColors.border,
        outlineVariant = RoyColors.input,
        surfaceDim = RoyColors.background,
        surfaceBright = RoyColors.popover,
        surfaceContainerLowest = RoyColors.background,
        surfaceContainerLow = RoyColors.card,
        surfaceContainer = RoyColors.card,
        surfaceContainerHigh = RoyColors.popover,
        surfaceContainerHighest = RoyColors.muted,
    )
