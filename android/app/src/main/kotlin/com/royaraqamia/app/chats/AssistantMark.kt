package com.royaraqamia.app.chats

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.Recipes

/**
 * The assistant's own mark, the app's half of `frontend/ui/chats/assistant-mark.tsx`.
 *
 * The row drew the first letter of «المساعد الذكي» in the same circle every
 * other chat uses, so the product's one advertised feature looked like a member
 * whose name happened to start with «ا». It is an orb with an orbit around it:
 * the gradient tile is the site's own call-to-action gradient, and the glyph is
 * white so it reads on the tile at 36dp and at 48dp alike.
 *
 * Drawn rather than loaded: there is no vector asset for it, and the site draws
 * the same shape inline for the same reason (an SVG source is not a photograph).
 */
@Composable
fun AssistantMark(size: Dp = 36.dp, dimmed: Boolean = false) {
    val glyph = if (dimmed) Color.White.copy(alpha = 0.75f) else Color.White

    Box(
        modifier =
            Modifier.size(size)
                .border(1.dp, Color.White.copy(alpha = 0.25f), CircleShape)
                .background(Brush.linearGradient(Recipes.Cta.stops), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(size * 0.58f)) {
            val radius = this.size.minDimension / 2f

            rotate(degrees = -28f) {
                drawOval(
                    color = glyph.copy(alpha = 0.55f),
                    topLeft = Offset(center.x - radius, center.y - radius * 0.44f),
                    size = Size(radius * 2f, radius * 0.88f),
                    style = Stroke(width = radius * 0.16f),
                )
            }

            drawCircle(color = glyph, radius = radius * 0.36f, center = center)
            drawCircle(
                color = glyph,
                radius = radius * 0.16f,
                center = Offset(center.x + radius * 0.8f, center.y - radius * 0.42f),
            )
        }
    }
}
