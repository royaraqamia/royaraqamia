package com.royaraqamia.app.quran

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.QuranPlayerController
import com.royaraqamia.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The shell's half of the Quran routes (#955): read the vendored files off the
 * main thread, then hand the screen the values it draws.
 *
 * The read is from the APK's assets, so it cannot fail for want of a network;
 * a failure is a build without the files, and the screen says so rather than
 * painting an empty mushaf.
 */
@Composable
fun QuranIndexRoute(
    repository: QuranRepository,
    onOpenSurah: (Int) -> Unit,
    onOpenAyah: (surah: Int, ayah: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var loaded by remember { mutableStateOf<LoadedIndex?>(null) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        runCatching {
                withContext(Dispatchers.IO) {
                    LoadedIndex(
                        index = repository.index(),
                        pages = repository.pages(),
                        position = repository.position(),
                    )
                }
            }
            .onSuccess { loaded = it }
            .onFailure { failed = true }
    }

    val value = loaded
    when {
        value != null ->
            QuranIndexScreen(
                index = value.index,
                pages = value.pages,
                position = value.position,
                loadSearch = { withContext(Dispatchers.IO) { repository.searchCorpus() } },
                onOpenSurah = onOpenSurah,
                onOpenAyah = onOpenAyah,
                modifier = modifier,
            )
        failed -> LoadFailure(modifier)
        else -> Loading(modifier)
    }
}

@Composable
fun QuranSurahRoute(
    repository: QuranRepository,
    number: Int,
    targetAyah: Int?,
    onSavePosition: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    var loaded by remember(number, targetAyah) { mutableStateOf<LoadedSurah?>(null) }
    var failed by remember(number, targetAyah) { mutableStateOf(false) }

    val context = LocalContext.current
    val player = remember(number) { QuranPlayerController(context) }
    val snapshot by player.state.collectAsState()

    LaunchedEffect(player, loaded) {
        val value = loaded ?: return@LaunchedEffect
        player.connect()
        player.refreshSaved(number, value.summary.ayahCount)
    }

    DisposableEffect(player) {
        onDispose { player.release() }
    }

    LaunchedEffect(number, targetAyah) {
        runCatching {
                withContext(Dispatchers.IO) {
                    val index = repository.index()
                    val surah = repository.surah(number) ?: error("no surah $number")
                    val summary = index.surahs.firstOrNull { it.n == number } ?: error("no summary")
                    LoadedSurah(
                        surah = surah,
                        summary = summary,
                        marks = repository.pages().marksForSurah(number),
                        position =
                            targetAyah?.let { QuranReadingPosition(number, it, "") }
                                ?: repository.position(),
                    )
                }
            }
            .onSuccess { loaded = it }
            .onFailure { failed = true }
    }

    val value = loaded
    when {
        value != null ->
            QuranSurahScreen(
                surah = value.surah,
                summary = value.summary,
                marks = value.marks,
                position = value.position,
                onSavePosition = onSavePosition,
                modifier = modifier,
                face = QuranPlayerFace.of(number, snapshot),
                saved =
                    QuranPlayerSaved(
                        complete = snapshot.saved == "complete",
                        partial = snapshot.saved == "partial",
                        bytes = snapshot.savedBytes,
                        removeFailed = snapshot.removeFailed,
                    ),
                onPlay = { player.play(number, ayahCount = value.summary.ayahCount) },
                onToggle = { player.toggle() },
                onStop = { player.stop() },
                onRemove = { player.remove(number) },
            )
        failed -> LoadFailure(modifier)
        else -> Loading(modifier)
    }
}

private data class LoadedIndex(
    val index: QuranIndex,
    val pages: QuranPages,
    val position: QuranReadingPosition?,
)

private data class LoadedSurah(
    val surah: QuranSurah,
    val summary: QuranSurahSummary,
    val marks: Map<Int, QuranAyahMarks>,
    val position: QuranReadingPosition?,
)

@Composable
private fun Loading(modifier: Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun LoadFailure(modifier: Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = stringResource(R.string.quran_load_failed))
        }
    }
}
