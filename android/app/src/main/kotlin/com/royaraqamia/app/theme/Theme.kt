package com.royaraqamia.app.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalConfiguration

/**
 * The width the locals answer for before a window exists: 320 dp, the narrowest
 * screen the app supports. A preview, a test and a screenshot all read the floor
 * rather than a number chosen by whoever wrote the call.
 */
const val ROY_DEFAULT_WIDTH_DP = 320f

/** The spacing the current window resolves to (see [fluidDp]). */
val LocalRoySpacing = staticCompositionLocalOf { roySpacing(ROY_DEFAULT_WIDTH_DP) }

/** The type scale the current window resolves to (see [fluidSp]). */
val LocalRoyTypeScale = staticCompositionLocalOf { royTypeScale(ROY_DEFAULT_WIDTH_DP) }

/**
 * The app's theme: the one token source in Compose's terms (ADR-0089).
 *
 * Colour, type, spacing and shape all come from the generated tokens, so editing
 * a token and regenerating changes what the app draws, and there is no second copy
 * of the palette in Kotlin for the two clients to disagree about. The fluid steps
 * are resolved here, once per window width, rather than at each call site: a
 * screen asks [LocalRoySpacing] for `section` and gets the same number on every
 * screen of a 320 dp phone.
 *
 * The site is dark only, so there is no light scheme to switch to (ADR-0054); a
 * phone in light mode still gets the product's palette rather than the platform's.
 */
@Composable
fun RoyaraqamiaTheme(content: @Composable () -> Unit) {
    val widthDp = LocalConfiguration.current.screenWidthDp.toFloat()
    val typeScale = royTypeScale(widthDp)
    val colorScheme = remember { royColorScheme() }
    val shapes = remember { royShapes() }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = royTypography(typeScale),
        shapes = shapes,
    ) {
        CompositionLocalProvider(
            LocalRoySpacing provides roySpacing(widthDp),
            LocalRoyTypeScale provides typeScale,
            content = content,
        )
    }
}
