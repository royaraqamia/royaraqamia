package com.royaraqamia.app.quran

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * One Ayah's mark control, the app's half of the pair with
 * `frontend/ui/quran/ayah-mark-button.tsx` (#1751).
 *
 * The label comes from the same copy source as the site's, and the icon is the
 * site's own glyph rather than a redrawn bookmark. Tapping asks the store to
 * write a bookmark row and its client-id'd replay intent; the server's own
 * refusal sentence is shown unchanged when a plan cap refuses the mark.
 */
@Composable
fun QuranAyahMarkButton(
    number: Int,
    marked: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    refusal: String? = null,
) {
    val description = QuranAyahMarkCopy.MARK_AYAH.replace("{ayah}", number.toString())
    Icon(
        imageVector = LucideVectors.Bookmark,
        contentDescription = description,
        tint = if (marked) Color(0xFFA684FF) else Color(0xFFA684FF).copy(alpha = 0.55f),
        modifier =
            modifier
                .size(18.dp)
                .clickable(enabled = enabled) { onToggle() }
                .semantics { contentDescription = description },
    )
    if (refusal != null) {
        Text(
            text = refusal.ifEmpty { QuranAyahMarkCopy.SAVE_FAILED },
            color = Color(0xFFE5A0A0),
            fontSize = 11.sp,
        )
    }
}
