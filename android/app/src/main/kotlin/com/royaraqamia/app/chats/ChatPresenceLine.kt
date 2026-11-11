package com.royaraqamia.app.chats

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * «يكتب الآن...» / «يُسجِّل رسالة صوتيَّة...», with the three dots kept alive.
 *
 * The copy owns the sentence, including its dots; this splits them off and
 * animates only the dots, so the words stay the site's and a reader who asked
 * the platform for less motion still gets the same sentence standing still. The
 * colour is the primary one: the live line is the only thing in the header and
 * the row that is happening now (ADR-0165).
 */
@Composable
fun ChatPresenceLine(
    label: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val text = label.removeSuffix("...")
    val animated = text != label

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(1.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            text = text,
            style = style,
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        if (animated) {
            val transition = rememberInfiniteTransition(label = "presence")
            repeat(3) { index ->
                val alpha by transition.animateFloat(
                    initialValue = 0.25f,
                    targetValue = 1f,
                    animationSpec =
                        infiniteRepeatable(
                            animation = tween(durationMillis = 900, delayMillis = index * 160),
                            repeatMode = RepeatMode.Reverse,
                        ),
                    label = "presenceDot$index",
                )
                Text(text = ".", style = style, color = color.copy(alpha = alpha))
            }
        }
    }
}
