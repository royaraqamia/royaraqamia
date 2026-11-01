package com.royaraqamia.app.spendtrack

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.spendtrack.SpendtrackRepository
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * SpendTrack's CSV import (#653), the app's half of
 * `frontend/ui/spendtrack/csv-actions.tsx`.
 *
 * The site's control in the site's words: a button, a dialog that names the four
 * columns, the system picker in place of the file input, and the two answers an
 * import can give — how many rows were taken and how many were skipped.
 *
 * This is the one action on the surface that needs the network. It is not an
 * Outbox intent — the site makes the request and reports its answer, and a
 * queued import would answer a user who is no longer there — so an offline
 * attempt says so with the site's own failure sentence rather than pretending
 * the rows landed. The rows a successful import creates arrive on the next pull,
 * because the server writes them.
 */
@Composable
fun SpendtrackCsvImport(
    repository: SpendtrackRepository,
    onImported: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var open by remember { mutableStateOf(false) }
    var fileName by remember { mutableStateOf<String?>(null) }
    var content by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var answer by remember { mutableStateOf<String?>(null) }
    var failure by remember { mutableStateOf<String?>(null) }

    fun read(uri: android.net.Uri) {
        scope.launch {
            val text =
                withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openInputStream(uri)?.bufferedReader()?.use {
                            it.readText()
                        }
                    }.getOrNull()
                }
            content = text.orEmpty()
            if (content.isBlank()) {
                failure = SpendtrackCsvCopy.FAILED
            } else {
                failure = null
            }
        }
    }

    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            fileName = uri.lastPathSegment?.substringAfterLast('/')
            read(uri)
        }

    OutlinedButton(
        onClick = { open = true },
        modifier = modifier,
    ) {
        Icon(
            imageVector = LucideVectors.Upload,
            contentDescription = null,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = SpendtrackCsvCopy.ACTION,
            modifier = Modifier.padding(start = 6.dp),
        )
    }

    if (!open) return

    androidx.compose.ui.window.Dialog(onDismissRequest = { open = false }) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.background,
            border = Recipes.Card.border,
            modifier = Modifier.fillMaxWidth(0.94f),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Text(
                    text = SpendtrackCsvCopy.TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                )
                Text(
                    text = SpendtrackCsvCopy.COLUMNS_HINT,
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                )
                Text(
                    text = SpendtrackCsvCopy.RULES,
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                )

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = Recipes.Card.radius,
                    colors = CardDefaults.cardColors(containerColor = RoyColors.muted),
                    border = Recipes.Card.border,
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(spacing.elementGapSm),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = LucideVectors.CloudUpload,
                            contentDescription = null,
                            tint = RoyColors.primary,
                            modifier = Modifier.size(Recipes.Glyph.md),
                        )
                        TextButton(onClick = { picker.launch(arrayOf("text/csv", "text/comma-separated-values", "text/plain")) }) {
                            Text(fileName ?: SpendtrackCsvCopy.PICK_FILE, style = type.small)
                        }
                    }
                }

                answer?.let {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = LucideVectors.FileText,
                            contentDescription = null,
                            tint = RoyColors.success,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(text = it, style = type.xs, color = RoyColors.success)
                    }
                }

                failure?.let {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = LucideVectors.CircleAlert,
                            contentDescription = null,
                            tint = RoyColors.destructive,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(text = it, style = type.xs, color = RoyColors.destructive)
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm, Alignment.End),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { open = false }) {
                        Text(ConnectedAppsCopy.CANCEL, color = Recipes.Row.labelColor)
                    }
                    Button(
                        enabled = !busy && content.isNotBlank(),
                        onClick = {
                            busy = true
                            failure = null
                            answer = null
                            scope.launch {
                                when (val result = repository.importCsv(content)) {
                                    is ApiResult.Success -> {
                                        answer =
                                            SpendtrackCsvCopy.IMPORTED.replace(
                                                "{count}",
                                                result.value.imported.toString(),
                                            ) +
                                                if (result.value.errors.isNotEmpty()) {
                                                    " · " +
                                                        SpendtrackCsvCopy.SKIPPED.replace(
                                                            "{count}",
                                                            result.value.skipped.toString(),
                                                        )
                                                } else {
                                                    ""
                                                }
                                        onImported()
                                    }
                                    is ApiResult.Failure -> failure = SpendtrackCsvCopy.FAILED
                                }
                                busy = false
                            }
                        },
                    ) {
                        if (busy) {
                            Icon(
                                imageVector = LucideVectors.LoaderCircle,
                                contentDescription = null,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                            Text(
                                text = SpendtrackCsvCopy.IMPORTING,
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        } else {
                            Text(SpendtrackCsvCopy.ACTION)
                        }
                    }
                }
            }
        }
    }
}
