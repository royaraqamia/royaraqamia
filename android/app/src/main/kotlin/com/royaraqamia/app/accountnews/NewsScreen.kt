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
 * The site's `/account/news` as a screen (#950).
 *
 * The page's three islands, in the page's order: the checklist, the private
 * sources and the proposal form. The screen owns what the page's hooks own — when
 * to read, what a refused write leaves on screen, and the fact that a failed
 * proposal keeps both fields — while the three cards are the pair renderings.
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
    var removingId by remember { mutableStateOf<String?>(null) }
    var enablingDigest by remember { mutableStateOf(false) }
    var privateError by remember { mutableStateOf<String?>(null) }

    var requests by remember { mutableStateOf<List<NewsRequest>>(emptyList()) }
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
        privateSources = NewsPrivateSourcesUiState.Loading
        privateSources = NewsPrivateSourcesUiState.from(repository.privateSources())
        privateError = null
    }

    suspend fun readRequests() {
        when (val result = repository.requests()) {
            is ApiResult.Success -> requests = result.value
            // The list is a convenience; the form below still works, exactly as
            // the page's island treats a failed read.
            is ApiResult.Failure -> requests = emptyList()
        }
    }

    LaunchedEffect(repository, signedIn) {
        if (!signedIn) {
            preferences = NewsPreferencesUiState.SignedOut
            return@LaunchedEffect
        }
        readPreferences()
        readPrivate()
        readRequests()
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

    fun togglePersonal() {
        val current = preferences
        if (current is NewsPreferencesUiState.Ready) {
            preferences = current.copy(personalEnabled = !current.personalEnabled)
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
            when (val result = repository.saveSelection(sourceIds, current.personalEnabled)) {
                is ApiResult.Success ->
                    preferences =
                        current.copy(
                            selected =
                                if (result.value.selected.isEmpty()) {
                                    current.sources.map { it.id }.toSet()
                                } else {
                                    result.value.selected
                                },
                            personalEnabled = result.value.personalEnabled,
                        )
                is ApiResult.Failure ->
                    preferencesError =
                        NewsFailure.message(result.error, AccountNewsPreferencesCopy.SAVE_FAILED)
            }
            savingPreferences = false
        }
    }

    fun enableDigest() {
        if (enablingDigest) return
        scope.launch {
            enablingDigest = true
            privateError = null
            when (val result = repository.enablePersonalDigest()) {
                is ApiResult.Success -> privateSources = NewsPrivateSourcesUiState.Ready(result.value)
                is ApiResult.Failure ->
                    privateError =
                        NewsFailure.message(result.error, AccountNewsPrivateCopy.ENABLE_FAILED)
            }
            enablingDigest = false
        }
    }

    fun removeSource(id: String) {
        if (removingId != null) return
        scope.launch {
            removingId = id
            privateError = null
            when (val result = repository.deletePrivateSource(id)) {
                is ApiResult.Success -> {
                    val current = privateSources
                    if (current is NewsPrivateSourcesUiState.Ready) {
                        val summary = current.summary
                        privateSources =
                            NewsPrivateSourcesUiState.Ready(
                                summary.copy(
                                    sources = summary.sources.filter { it.id != id },
                                    used = (summary.used - 1).coerceAtLeast(0),
                                )
                            )
                    }
                }
                is ApiResult.Failure ->
                    privateError =
                        NewsFailure.message(result.error, AccountNewsPrivateCopy.REMOVE_FAILED)
            }
            removingId = null
        }
    }

    fun submit() {
        if (requestState is NewsSourceRequestUiState.Submitting) return
        scope.launch {
            requestState = NewsSourceRequestUiState.Submitting
            when (val result = repository.submitRequest(url.trim())) {
                is ApiResult.Success -> {
                    requests = listOf(result.value) + requests
                    url = ""
                    requestState = NewsSourceRequestUiState.Submitted
                }
                is ApiResult.Failure ->
                    requestState =
                        NewsSourceRequestUiState.Failed(
                            NewsFailure.message(result.error, AccountNewsRequestCopy.SEND_FAILED)
                        )
            }
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
            onTogglePersonal = ::togglePersonal,
            onSave = ::save,
        )

        if (signedIn) {
            Divider()

            NewsPrivateSourcesCard(
                state = privateSources,
                removingId = removingId,
                enablingDigest = enablingDigest,
                actionError = privateError,
                onRetry = { scope.launch { readPrivate() } },
                onEnableDigest = ::enableDigest,
                onRemove = ::removeSource,
            )

            Divider()

            NewsSourceRequestCard(
                state = requestState,
                url = url,
                requests = requests,
                onUrlChange = {
                    url = it
                    if (requestState is NewsSourceRequestUiState.Submitted) {
                        requestState = NewsSourceRequestUiState.Idle
                    }
                },
                onSubmit = ::submit,
            )
        }
    }
}

@Composable
private fun Divider() {
    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.5f))
}
