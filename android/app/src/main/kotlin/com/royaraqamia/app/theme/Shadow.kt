package com.royaraqamia.app.theme

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp

/**
 * An inset shadow, drawn rather than declared (#647, ADR-0101).
 *
 * The site's `shadow-inner` is `inset 0 2px 4px rgb(0 0 0 / 0.05)`: a soft dark
 * edge just inside a shape. Material has no inset elevation, and there is no
 * number a card could pass to `Modifier.shadow` that means "inside". So the shape
 * is clipped and a short vertical gradient lies over its top edge - the same
 * colour, the same offset and the same blur distance, as a wash rather than a CSS
 * blur. At the recipe's 5% alpha the two are indistinguishable, and both clients
 * read the numbers from `shared/components/recipes.json`.
 */
fun Modifier.royInsetShadow(
    shape: Shape,
    color: Color,
    blur: Dp,
    offsetY: Dp,
): Modifier =
    this.clip(shape).drawWithContent {
        drawContent()
        drawRect(
            brush =
                Brush.verticalGradient(
                    0f to color,
                    1f to Color.Transparent,
                    startY = offsetY.toPx(),
                    endY = offsetY.toPx() + blur.toPx(),
                ),
            topLeft = Offset.Zero,
            size = size,
        )
    }
