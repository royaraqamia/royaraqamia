package com.royaraqamia.app.quran

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * One Ayah's study control, the app's half of the pair with
 * `frontend/ui/quran/ayah-tafsir.tsx` (#1751).
 *
 * The sura's vendored file is read on the first open, as the page fetches it on
 * first open; once read it stays in the repository, so the notes open with the
 * network off. Every word here comes from the same copy source as the site's.
 */
@Composable
fun QuranAyahTafsir(
    ayah: Int,
    load: suspend () -> QuranSurahTafsir?,
    modifier: Modifier = Modifier,
) {
    var open by remember(ayah) { mutableStateOf(false) }
    var file by remember(ayah) { mutableStateOf<QuranSurahTafsir?>(null) }
    var phase by remember(ayah) { mutableStateOf(Phase.AtRest) }
    val scope = rememberCoroutineScope()

    fun request() {
        if (phase == Phase.Loading) return
        phase = Phase.Loading
        scope.launch {
            val loaded = runCatching { load() }.getOrNull()
            file = loaded
            phase = if (loaded == null) Phase.Failed else Phase.Open
        }
    }

    fun toggle() {
        open = !open
        if (open && file == null) request()
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            text = QuranAyahTafsirCopy.TOGGLE,
            color = Color(0xFFA684FF),
            fontSize = 12.sp,
            modifier =
                Modifier.clickable { toggle() }.semantics {
                    contentDescription =
                        QuranAyahTafsirCopy.PANEL_LABEL.replace("{ayah}", ayah.toString())
                },
        )
        if (open) {
            when (phase) {
                Phase.Loading ->
                    Text(text = QuranAyahTafsirCopy.LOADING, color = Color(0xFFB9BAC4), fontSize = 11.sp)
                Phase.Failed -> {
                    Text(text = QuranAyahTafsirCopy.FAILED, color = Color(0xFFE5A0A0), fontSize = 11.sp)
                    Text(
                        text = QuranAyahTafsirCopy.RETRY,
                        color = Color(0xFFA684FF),
                        fontSize = 11.sp,
                        modifier = Modifier.clickable { request() },
                    )
                }
                Phase.Open -> {
                    val body = file?.ayat?.firstOrNull { it.ayah == ayah }?.text
                    if (body.isNullOrEmpty()) {
                        Text(
                            text = QuranAyahTafsirCopy.MISSING,
                            color = Color(0xFFB9BAC4),
                            fontSize = 11.sp,
                        )
                    } else {
                        Text(text = body, color = Color(0xFFE8E8EE), fontSize = 13.sp, lineHeight = 22.sp)
                        Text(
                            text = QuranAyahTafsirCopy.CREDIT,
                            color = Color(0xFF8E90A0),
                            fontSize = 10.sp,
                        )
                    }
                }
                Phase.AtRest -> Unit
            }
        }
    }
}

private enum class Phase { AtRest, Loading, Failed, Open }
