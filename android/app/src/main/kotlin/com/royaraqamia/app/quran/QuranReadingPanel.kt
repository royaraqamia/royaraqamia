package com.royaraqamia.app.quran

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * What a reader brings back to the index: where they stopped and what they
 * marked. The app's half of the pair with `frontend/ui/quran/reading-panel.tsx`
 * (#1751). Both the resume card and the «علاماتي» list come from the same
 * generated copy the page reads, and the glyphs are the site's own.
 */
@Composable
fun QuranReadingPanel(
    position: QuranReadingPosition?,
    names: List<QuranSurahSummary>,
    bookmarks: List<QuranBookmarkRow>,
    onOpenAyah: (surah: Int, ayah: Int) -> Unit,
    onRemoveBookmark: (clientId: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (position == null && bookmarks.isEmpty()) return
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (position != null) {
            val shape = RoundedCornerShape(16.dp)
            Row(
                modifier =
                    Modifier.fillMaxWidth()
                        .testTag(QuranReadingPanelMetrics.RESUME)
                        .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), shape)
                        .clickable(role = androidx.compose.ui.semantics.Role.Button) {
                            onOpenAyah(position.surah, position.ayah)
                        }
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.BookOpenCheck,
                    contentDescription = null,
                    tint = RoyColors.primary,
                    modifier = Modifier.size(20.dp),
                )
                Column {
                    Text(text = QuranIndexCopy.RESUME_READING, color = RoyColors.mutedForeground, fontSize = 11.sp)
                    Text(
                        text =
                            buildAnnotatedString {
                                append("${names.getOrNull(position.surah - 1)?.name.orEmpty()} · ${QuranIndexCopy.RESUME_AYAH} ")
                                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) {
                                    append(position.ayah.toString())
                                }
                            },
                        color = RoyColors.foreground,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                    )
                }
            }
        }

        if (bookmarks.isNotEmpty()) {
            Column(
                modifier =
                    Modifier.fillMaxWidth()
                        .testTag(QuranReadingPanelMetrics.BOOKMARKS)
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                        .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = LucideVectors.BookMarked,
                        contentDescription = null,
                        tint = RoyColors.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = QuranReadingPanelCopy.BOOKMARKS,
                        color = RoyColors.foreground,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 8.dp),
                    )
                }
                bookmarks.forEach { bookmark ->
                    val name = names.getOrNull(bookmark.surah - 1)?.name.orEmpty()
                    Row(
                        modifier = Modifier.fillMaxWidth().testTag(QuranReadingPanelMetrics.rowTag(bookmark.ayah)),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "$name · ${bookmark.ayah}",
                            color = RoyColors.foreground,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            modifier =
                                Modifier.clickable { onOpenAyah(bookmark.surah, bookmark.ayah) },
                        )
                        Icon(
                            imageVector = LucideVectors.X,
                            contentDescription =
                                QuranReadingPanelCopy.REMOVE_BOOKMARK
                                    .replace("{surah}", name)
                                    .replace("{ayah}", bookmark.ayah.toString()),
                            tint = RoyColors.mutedForeground,
                            modifier =
                                Modifier.size(14.dp).clickable { onRemoveBookmark(bookmark.clientId) }
                                    .semantics {
                                        contentDescription =
                                            QuranReadingPanelCopy.REMOVE_BOOKMARK
                                                .replace("{surah}", name)
                                                .replace("{ayah}", bookmark.ayah.toString())
                                    },
                        )
                    }
                }
            }
        }
    }
}

internal object QuranReadingPanelMetrics {
    const val RESUME = "quran-resume-panel"
    const val BOOKMARKS = "quran-bookmarks-panel"

    fun rowTag(ayah: Int) = "quran-bookmark-row-$ayah"
}
