package com.royaraqamia.app.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Material's five corner steps, from the one radius the tokens name.
 *
 * `app/theme.css` derives the site's scale from `--radius`: `sm` is four less,
 * `md` two less, `lg` is the token and `xl` four more. The same four are mapped
 * onto Material here, and its largest step shares `xl` because the site has
 * nothing above it; a fifth number would be a corner no web surface has.
 */
fun royShapes(): Shapes {
    val base = DesignTokens.Radii.base
    val extraLarge = RoundedCornerShape((base + 4f).dp)
    return Shapes(
        extraSmall = RoundedCornerShape((base - 4f).dp),
        small = RoundedCornerShape((base - 2f).dp),
        medium = RoundedCornerShape(base.dp),
        large = extraLarge,
        extraLarge = extraLarge,
    )
}
