/*
 * Copyright (C) 2026 royaraqamia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package dev.patrickgold.florisboard.ime.rewrite

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import dev.patrickgold.florisboard.BuildConfig
import dev.patrickgold.florisboard.editorInstance
import dev.patrickgold.florisboard.ime.nlp.WordSuggestionCandidate
import dev.patrickgold.florisboard.ime.theme.FlorisImeUi
import dev.patrickgold.florisboard.keyboardManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.florisboard.lib.snygg.ui.SnyggRow
import org.florisboard.lib.snygg.ui.SnyggText

/** What the strip above the keys shows after a tap. Nothing is inserted by us. */
sealed class RewriteDisplay {
    object None : RewriteDisplay()
    data class Suggestion(val text: String) : RewriteDisplay()
    object Failure : RewriteDisplay()
}

internal object RewriteUiState {
    var display by mutableStateOf<RewriteDisplay>(RewriteDisplay.None)
    var busy by mutableStateOf(false)
}

private fun endpoint(): String = "${BuildConfig.SITE_URL}/api/keyboard/rewrite"

/**
 * The rewrite button in the candidates row. It appears only while a credential
 * is stored, which is also the keyboard's visible consent indicator. The
 * composing text is read inside the click handler — never on a keystroke — and
 * a failed call leaves the editor untouched.
 */
@Composable
fun RewriteButton() {
    val context = LocalContext.current
    if (!RewriteCredentialStore.enabled(context)) return
    val scope = rememberCoroutineScope()
    val keyboardManager by context.keyboardManager()
    val editorInstance by context.editorInstance()

    SnyggRow(
        elementName = FlorisImeUi.SmartbarCandidateWord.elementName,
        modifier = Modifier
            .fillMaxHeight()
            .clickable(enabled = !RewriteUiState.busy) {
                val tap = RewriteTap.fromComposing(editorInstance.activeContent.composingText)
                RewriteUiState.busy = true
                scope.launch(Dispatchers.IO) {
                    val token = RewriteCredentialStore.read(context)
                    val outcome = if (token == null) {
                        RewriteResult.Failure
                    } else {
                        RewriteGateway(endpoint = endpoint()).rewrite(tap, token)
                    }
                    withContext(Dispatchers.Main) {
                        RewriteUiState.display = when (outcome) {
                            is RewriteResult.Suggestion -> RewriteDisplay.Suggestion(outcome.text)
                            RewriteResult.Failure -> RewriteDisplay.Failure
                        }
                        RewriteUiState.busy = false
                    }
                }
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SnyggText(text = RewriteCopy.REWRITE_LABEL)
    }
}

/**
 * The strip above the keys. A suggestion is a candidate the member taps to
 * commit; a failure is one sentence from the shared copy, and the composing
 * text stays exactly as it was.
 */
@Composable
fun RewriteStrip() {
    val context = LocalContext.current
    val keyboardManager by context.keyboardManager()
    val display = RewriteUiState.display
    when (display) {
        RewriteDisplay.None -> Unit
        RewriteDisplay.Failure -> SnyggRow(
            elementName = FlorisImeUi.SmartbarCandidatesRow.elementName,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SnyggText(text = RewriteCopy.FAILURE)
        }

        is RewriteDisplay.Suggestion -> SnyggRow(
            elementName = FlorisImeUi.SmartbarCandidateWord.elementName,
            modifier = Modifier.clickable {
                keyboardManager.commitCandidate(
                    WordSuggestionCandidate(
                        text = display.text,
                        secondaryText = RewriteCopy.SUGGESTION_HINT,
                        isEligibleForAutoCommit = false,
                        isEligibleForUserRemoval = false,
                    ),
                )
                RewriteUiState.display = RewriteDisplay.None
            },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SnyggText(text = display.text)
            SnyggText(text = RewriteCopy.SUGGESTION_HINT)
        }
    }
}
