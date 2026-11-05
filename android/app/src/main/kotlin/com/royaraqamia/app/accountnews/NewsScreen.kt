package com.royaraqamia.app.accountnews

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.style.TextAlign
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import kotlinx.coroutines.launch

/**
 * The site's `/account/news` as a screen (#950, ADR-0130).
 *
 * The page's two islands, in the page's order: the checklist, then the one list
 * of the reader's own sources — the field a link is added with, and the rows it
 * lands in. The screen owns what the page's hooks own — when to read, what a
 * refused write leaves on screen, and the confirmation before a row is cleared —
 * while the two cards are the pair renderings.
 *
 * It is ported and switched off: the shell still hands `/account/news` to the
 * document until the visual gate passes (ADR-0117, ADR-0118).
 */
@Composable
fun NewsScreen(
    repository: NewsRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var preferences by remember {
        mutableStateOf<NewsPreferencesUiState>(NewsPreferencesUiState.Loading)
    }
    var savingPreferences by remember { mutableStateOf(false) }
    var preferencesError by remember { mutableStateOf<String?>(null) }

    var privateSources by remember {
        mutableStateOf<NewsPrivateSourcesUiState>(NewsPrivateSourcesUiState.Loading)
    }
    var removing by remember { mutableStateOf<NewsOwnedSource?>(null) }
    var removingId by remember { mutableStateOf<String?>(null) }
    var privateError by remember { mutableStateOf<String?>(null) }

    var requestState by remember {
        mutableStateOf<NewsSourceRequestUiState>(NewsSourceRequestUiState.Idle)
    }
    var url by remember { mutableStateOf("") }

    suspend fun readPreferences() {
        preferences = NewsPreferencesUiState.Loading
        preferences = NewsPreferencesUiState.from(repository.selection())
        preferencesError = null
    }

    suspend fun readPrivate() {
        privateError = null
        privateSources = NewsPrivateSourcesUiState.from(repository.ownedSources())
    }

    LaunchedEffect(repository, signedIn) {
        if (!signedIn) {
            preferences = NewsPreferencesUiState.SignedOut
            return@LaunchedEffect
        }
        readPreferences()
        privateSources = NewsPrivateSourcesUiState.Loading
        readPrivate()
    }

    fun toggleSource(id: String) {
        val current = preferences
        if (current is NewsPreferencesUiState.Ready) {
            val next =
                if (current.selected.contains(id)) current.selected - id
                else current.selected + id
            preferences = current.copy(selected = next)
        }
    }

    fun selectAll() {
        val current = preferences
        if (current is NewsPreferencesUiState.Ready) {
            preferences = current.copy(selected = current.sources.map { it.id }.toSet())
        }
    }

    fun save() {
        val current = preferences
        if (current !is NewsPreferencesUiState.Ready || savingPreferences) return

        scope.launch {
            savingPreferences = true
            preferencesError = null
            val allSelected =
                current.sources.isNotEmpty() && current.selected.size == current.sources.size
            // All ticked is "everything", stored as an empty list, exactly as the
            // page's form saves it.
            val sourceIds = if (allSelected) emptyList() else current.selected.toList()
            when (val result = repository.saveSelection(sourceIds)) {
                is ApiResult.Success ->
                    preferences =
                        current.copy(
                            selected =
                                if (result.value.selected.isEmpty()) {
                                    current.sources.map { it.id }.toSet()
                                } else {
                                    result.value.selected
                                },
                        )
                is ApiResult.Failure ->
                    preferencesError =
                        NewsFailure.message(result.error, AccountNewsPreferencesCopy.SAVE_FAILED)
            }
            savingPreferences = false
        }
    }

    fun submit() {
        if (requestState is NewsSourceRequestUiState.Submitting) return
        scope.launch {
            requestState = NewsSourceRequestUiState.Submitting
            when (val result = repository.submitRequest(url.trim())) {
                is ApiResult.Success -> {
                    url = ""
                    requestState = NewsSourceRequestUiState.Submitted
                    // The new row is the list's, not the form's: read it back so the
                    // reader sees the link the moment the server has it (ADR-0130).
                    readPrivate()
                }
                is ApiResult.Failure ->
                    requestState =
                        NewsSourceRequestUiState.Failed(
                            NewsFailure.message(result.error, AccountNewsRequestCopy.SEND_FAILED)
                        )
            }
        }
    }

    fun confirmRemove(row: NewsOwnedSource) {
        if (removingId != null) return
        scope.launch {
            removingId = row.id
            privateError = null
            val result =
                if (row.kind == "source") {
                    repository.deletePrivateSource(row.id)
                } else {
                    repository.deleteRequest(row.id)
                }
            when (result) {
                is ApiResult.Success -> {
                    removing = null
                    // The ceiling counts a pending row, so the list is read back
                    // rather than patched: the server already knows what the slot
                    // and the rows are now.
                    readPrivate()
                }
                is ApiResult.Failure ->
                    privateError =
                        NewsFailure.message(result.error, AccountNewsPrivateCopy.REMOVE_FAILED)
            }
            removingId = null
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Text(
            text = AccountNewsPreferencesCopy.PAGE_TITLE,
            modifier = Modifier.fillMaxWidth().testTag("account-news-title"),
            style = type.h2,
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        NewsPreferencesCard(
            state = preferences,
            saving = savingPreferences,
            actionError = preferencesError,
            onRetry = { scope.launch { readPreferences() } },
            onSignIn = onSignIn,
            onToggle = ::toggleSource,
            onToggleAll = ::selectAll,
            onSave = ::save,
        )

        if (signedIn) {
            Divider()

            NewsPrivateSourcesCard(
                state = privateSources,
                requestState = requestState,
                url = url,
                onUrlChange = {
                    url = it
                    if (requestState is NewsSourceRequestUiState.Submitted) {
                        requestState = NewsSourceRequestUiState.Idle
                    }
                },
                onSubmit = ::submit,
                removing = removing,
                removingId = removingId,
                actionError = privateError,
                onRetry = { scope.launch { readPrivate() } },
                onAskRemove = { removing = it },
                onDismissRemove = { removing = null },
                onConfirmRemove = ::confirmRemove,
            )
        }
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.5f))
}
