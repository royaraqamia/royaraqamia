package com.royaraqamia.app.spendtrack

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.testTag
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

/** The name the page downloads and the app shares (#961). */
const val SPENDTRACK_CSV_FILE_NAME = "spendtrack.csv"

/**
 * SpendTrack's CSV flow (#653, #961), the app's half of
 * `frontend/ui/spendtrack/csv-actions.tsx`.
 *
 * Two controls, the site's words: the import dialog that names the four columns
 * and reports how many rows it took, and the export that hands the same file the
 * page downloads to the platform's share sheet. The export asks the page's own
 * route rather than rebuilding the CSV from the store, so one implementation
 * writes the columns and the two clients cannot disagree about a row.
 *
 * Neither action is an Outbox intent: the page makes the request and reports its
 * answer, and a queued export would answer a user who is no longer there. An
 * offline import or export says so with the site's own failure sentence rather
 * than pretending the file or the rows landed.
 */
@Composable
fun SpendtrackCsvActions(
    repository: SpendtrackRepository,
    start: String,
    end: String,
    categories: List<String>,
    onImported: () -> Unit,
    onShare: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var importOpen by remember { mutableStateOf(false) }
    var exporting by remember { mutableStateOf(false) }
    var exportFailure by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        SpendtrackCsvButtons(
            onImport = { importOpen = true },
            onExport = {
                exportFailure = null
                exporting = true
                scope.launch {
                    when (val result = repository.exportCsv(start, end, categories)) {
                        is ApiResult.Success -> onShare(SPENDTRACK_CSV_FILE_NAME, result.value)
                        is ApiResult.Failure -> exportFailure = SpendtrackCsvCopy.EXPORT_FAILED
                    }
                    exporting = false
                }
            },
            exporting = exporting,
        )

        exportFailure?.let {
            Text(text = it, style = type.xs, color = RoyColors.destructive)
        }
    }

    if (importOpen) {
        SpendtrackCsvImportDialog(
            repository = repository,
            onImported = onImported,
            onDismiss = { importOpen = false },
        )
    }
}

/**
 * The two buttons the gate measures (#961).
 *
 * A stateless pair so the visual test draws the controls the screen draws rather
 * than a copy composed for the recording: the import opens the dialog, the export
 * asks the platform to share, and both take the same box the page gives them.
 */
@Composable
fun SpendtrackCsvButtons(
    onImport: () -> Unit,
    onExport: () -> Unit,
    exporting: Boolean,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current

    Row(
        modifier = modifier.fillMaxWidth().testTag(SpendtrackMetrics.CSV_CONTROLS),
        horizontalArrangement = Arrangement.spacedBy(SpendtrackMetrics.CSV_GAP),
    ) {
        OutlinedButton(
            onClick = onImport,
            shape = MaterialTheme.shapes.large,
            contentPadding = PaddingValues(horizontal = 14.dp),
            modifier =
                Modifier.weight(1f)
                    .height(SpendtrackMetrics.CSV_HEIGHT)
                    .testTag(SpendtrackMetrics.CSV_IMPORT),
        ) {
            Icon(
                imageVector = LucideVectors.Upload,
                contentDescription = null,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = SpendtrackCsvCopy.ACTION,
                style = type.xs.copy(fontWeight = FontWeight.Medium),
                modifier = Modifier.padding(start = 8.dp),
            )
        }

        OutlinedButton(
            onClick = onExport,
            enabled = !exporting,
            shape = MaterialTheme.shapes.large,
            contentPadding = PaddingValues(horizontal = 14.dp),
            modifier =
                Modifier.weight(1f)
                    .height(SpendtrackMetrics.CSV_HEIGHT)
                    .testTag(SpendtrackMetrics.CSV_EXPORT),
        ) {
            Icon(
                imageVector =
                    if (exporting) LucideVectors.LoaderCircle else LucideVectors.Share2,
                contentDescription = null,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text =
                    if (exporting) SpendtrackCsvCopy.EXPORTING
                    else SpendtrackCsvCopy.EXPORT_ACTION,
                style = type.xs.copy(fontWeight = FontWeight.Medium),
                modifier = Modifier.padding(start = 8.dp),
            )
        }
    }
}

/** The import dialog: the four columns, the picker and the two answers an import can give. */
@Composable
private fun SpendtrackCsvImportDialog(
    repository: SpendtrackRepository,
    onImported: () -> Unit,
    onDismiss: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

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

    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
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
                        TextButton(
                            onClick = {
                                picker.launch(
                                    arrayOf(
                                        "text/csv",
                                        "text/comma-separated-values",
                                        "text/plain",
                                    )
                                )
                            }
                        ) {
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
                    TextButton(onClick = onDismiss) {
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
