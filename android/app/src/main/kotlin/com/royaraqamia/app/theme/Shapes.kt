package com.royaraqamia.app.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp

/**
 * Material's corner steps, from the one radius the tokens name.
 *
 * `app/theme.css` derives the site's scale from `--radius`: `sm` is four less,
 * `md` two less, `lg` is the token, `xl` four more and `2xl` eight more — the
 * corner the account cards ask for. The same steps are mapped onto Material here,
 * and its largest step shares `2xl` because the site has nothing above it; a
 * further number would be a corner no web surface has (ADR-0098).
 */
fun royShapes(): Shapes {
    val base = DesignTokens.Radii.base
    return Shapes(
        extraSmall = RoundedCornerShape((base - 4f).dp),
        small = RoundedCornerShape((base - 2f).dp),
        medium = RoundedCornerShape(base.dp),
        large = RoundedCornerShape((base + 4f).dp),
        // The site has nothing above `2xl`, and a card asks for [RoyShape.card]
        // rather than for a Material step by name.
        extraLarge = RoundedCornerShape((base + 8f).dp),
    )
}

/** The shapes a screen names by what it is, not by which Material step it got. */
object RoyShape {
    /** A card's corner: the site's `rounded-2xl` (ADR-0098). */
    val card: Shape
        get() = RoundedCornerShape((DesignTokens.Radii.base + 8f).dp)

    /** A badge's corner: the site's `rounded-full`. */
    val pill: Shape
        get() = RoundedCornerShape(percent = 50)
}
