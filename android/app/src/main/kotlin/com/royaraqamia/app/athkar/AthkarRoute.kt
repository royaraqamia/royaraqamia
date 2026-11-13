package com.royaraqamia.app.athkar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.shared.ReadFailureCopy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The shell's half of the Athkar routes (#1389): read the vendored files off the
 * main thread, then hand the screen the values it draws.
 *
 * The read is from the APK's own assets, so it cannot fail for want of a
 * network; a failure is a build without the files, and the screen says so rather
 * than painting an empty sitting.
 */
@Composable
fun AthkarRoute(
    repository: AthkarRepository,
    period: AthkarPeriod,
    onSelectPeriod: (AthkarPeriod) -> Unit,
    modifier: Modifier = Modifier,
) {
    var attempt by remember { mutableIntStateOf(0) }
    var collections by remember { mutableStateOf<Map<AthkarPeriod, AthkarCollection>?>(null) }
    var counts by remember { mutableStateOf<AthkarCounts?>(null) }
    var failed by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(attempt) {
        failed = false
        runCatching {
                withContext(Dispatchers.IO) {
                    val loaded =
                        AthkarPeriod.entries.associateWith { repository.collection(it) }
                    loaded to repository.counts()
                }
            }
            .onSuccess { (loaded, read) ->
                collections = loaded
                counts = read
            }
            .onFailure { failed = true }
    }

    val state = if (collections != null && counts != null) AthkarUiState.AtRest else null

    when (state) {
        AthkarUiState.AtRest ->
            AthkarScreen(
                collections = collections.orEmpty(),
                period = period,
                counts = counts ?: AthkarCounts(java.time.LocalDate.now().toString()),
                ready = true,
                onSelectPeriod = onSelectPeriod,
                onIncrement = { option, id, target ->
                    scope.launch {
                        counts =
                            withContext(Dispatchers.IO) {
                                repository.increment(option, id, target)
                            }
                    }
                },
                onReset = { option, id ->
                    scope.launch {
                        counts = withContext(Dispatchers.IO) { repository.reset(option, id) }
                    }
                },
                modifier = modifier,
            )
        null ->
            if (failed) {
                LoadFailure(onRetry = { attempt += 1 }, modifier = modifier)
            } else {
                Loading(modifier)
            }
    }
}

@Composable
private fun Loading(modifier: Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun LoadFailure(onRetry: () -> Unit, modifier: Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(text = ReadFailureCopy.TITLE)
            androidx.compose.material3.Button(onClick = onRetry) {
                Text(text = ReadFailureCopy.RETRY)
            }
        }
    }
}
