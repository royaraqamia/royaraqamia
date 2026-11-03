package com.royaraqamia.app.linksnap

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import kotlinx.coroutines.launch

/**
 * Opening a password-protected link (#654), ported from
 * `frontend/ui/linksnap/unlock-link-form.tsx`.
 *
 * The code is a live read: the password is checked by the server and the
 * destination is the answer, never a queued write. Offline, the screen says it
 * needs a connection rather than guessing -- the one state the site's form also
 * names.
 */
@Composable
fun LinksnapUnlockScreen(
    code: String,
    repository: LinksnapRepository,
    modifier: Modifier = Modifier,
    onOpenUrl: (String) -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var needsConnection by remember { mutableStateOf(false) }

    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "فتح الرَّابط",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "هذا الرَّابط محمي بكلمة مرور. أدخلها للمتابعة إلى الوجهة.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "/$code",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.primary,
        )
        OutlinedTextField(
            value = password,
            onValueChange = {
                password = it
                error = null
                needsConnection = false
            },
            label = { Text("كلمة المرور") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth().testTag("linksnap-unlock-password"),
        )
        Button(
            onClick = {
                if (busy) return@Button
                if (password.isBlank()) {
                    error = "أدخل كلمة المرور للمتابعة."
                    return@Button
                }
                scope.launch {
                    busy = true
                    error = null
                    needsConnection = false
                    when (val answer = repository.unlock(code, password)) {
                        is ApiResult.Success -> onOpenUrl(answer.value)
                        is ApiResult.Failure ->
                            when (val failure = answer.error) {
                                is ApiError.Network -> needsConnection = true
                                is ApiError.Server -> error = unlockMessage(failure.status)
                                ApiError.NotSignedIn ->
                                    error = "تعذَّر فتح الرَّابط. حاول مرَّة أخرى."
                                is ApiError.InvalidContract ->
                                    error = "تعذَّر قراءة رد الخادم."
                            }
                    }
                    busy = false
                }
            },
            enabled = !busy,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (busy) "جاري الفتح..." else "فتح الرَّابط")
        }
        if (needsConnection) {
            Text(
                text = "يتطلَّب فتح هذا الرَّابط اتِّصالاً بالإنترنت. تحقَّق من اتِّصالك ثم أعد المحاولة.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        error?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

/** The route's own words, from the status it answered with. */
private fun unlockMessage(status: Int): String =
    when (status) {
        401 -> "كلمة المرور غير صحيحة."
        404 -> "هذا الرَّابط غير موجود."
        403 -> "تم إلغاء تنشيط هذا الرَّابط."
        410 -> "انتهت صلاحية هذا الرَّابط."
        400 -> "هذا الرَّابط ليس محمياً بكلمة مرور."
        else -> "تعذَّر فتح الرَّابط. حاول مرَّة أخرى."
    }
