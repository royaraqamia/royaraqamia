package com.royaraqamia.app.chats

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The composer's attachment control, the app's half of the site's paperclip
 * (#933).
 *
 * It draws the files the member picked, each with its size and the close button
 * whose label comes from [ChatComposeAttachmentsCopy], and the paperclip that
 * opens the system picker. The picking itself is the platform's: the control
 * reads the file's name, type and size only, and the bytes are handed to the
 * storage put when the member sends ([ChatComposeFile]).
 *
 * Quotas are not this row's job. The thread validates a pick with
 * [ChatAttachments.stage] before it becomes [files], so a refused file never
 * reaches the screen.
 */
@Composable
fun ChatComposerAttach(
    files: List<ChatComposeFile>,
    enabled: Boolean,
    onPicked: (List<ChatComposeFile>) -> Unit,
    onRemove: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            if (uris.isEmpty()) return@rememberLauncherForActivityResult
            scope.launch {
                val picked =
                    withContext(Dispatchers.IO) {
                        uris.mapNotNull { uri -> readPickedFile(context, uri) }
                    }
                if (picked.isNotEmpty()) onPicked(picked)
            }
        }

    val state =
        if (files.isEmpty()) ChatComposerUiState.Empty else ChatComposerUiState.Staged

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
    ) {
        if (state == ChatComposerUiState.Staged) {
            files.forEachIndexed { index, file ->
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .background(RoyColors.muted.copy(alpha = 0.6f), RoundedCornerShape(8.dp))
                            .padding(horizontal = spacing.elementGapSm, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector =
                            if (file.mimeType.trim().lowercase().startsWith("audio/")) {
                                LucideVectors.Mic
                            } else {
                                LucideVectors.Paperclip
                            },
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(11.dp),
                    )
                    Text(
                        text = file.fileName,
                        style = type.xs,
                        color = RoyColors.foreground.copy(alpha = 0.8f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        text = ChatAttachments.formatSize(file.byteSize),
                        style = type.xs,
                        color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                    )
                    IconButton(
                        onClick = { onRemove(index) },
                        modifier = Modifier.size(20.dp),
                    ) {
                        Icon(
                            imageVector = LucideVectors.X,
                            contentDescription =
                                ChatComposeAttachmentsCopy.REMOVE_FILE.replace(
                                    "{name}",
                                    file.fileName,
                                ),
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(11.dp),
                        )
                    }
                }
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(
                onClick = { picker.launch(arrayOf("*/*")) },
                enabled = enabled,
                modifier = Modifier.size(Recipes.Glyph.md),
            ) {
                Icon(
                    imageVector = LucideVectors.Paperclip,
                    contentDescription = ChatComposeAttachmentsCopy.ATTACH,
                    tint =
                        if (enabled) RoyColors.mutedForeground
                        else RoyColors.mutedForeground.copy(alpha = 0.4f),
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
        }
    }
}

/**
 * One pick's metadata, read without touching its bytes.
 *
 * A provider that knows no size answers 0, which the per-file ceiling treats as
 * small: the upload itself still refuses anything the bucket will not take, and
 * guessing a size here would refuse a file the member can send.
 */
private fun readPickedFile(context: Context, uri: Uri): ChatComposeFile? =
    runCatching {
            val resolver = context.contentResolver
            var name: String? = null
            var size = -1L
            resolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (nameIndex >= 0) name = cursor.getString(nameIndex)
                        val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                        if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                            size = cursor.getLong(sizeIndex)
                        }
                    }
                }
            val fileName =
                name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
            val mimeType = resolver.getType(uri) ?: "application/octet-stream"
            ChatComposeFile(
                fileName = fileName,
                mimeType = mimeType,
                byteSize = if (size >= 0) size else 0L,
                open = {
                    resolver.openInputStream(uri)
                        ?: error("the picked file could not be opened")
                },
            )
        }
        .getOrNull()
