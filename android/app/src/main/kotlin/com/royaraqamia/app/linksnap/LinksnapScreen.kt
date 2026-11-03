package com.royaraqamia.app.linksnap

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.linksnap.LinksnapEdit
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.store.linksnap.LinksnapStatus
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * LinkSnap, drawn from the device (#654).
 *
 * The order of the reads is HabitFlow's (#649) and SpendTrack's (#653), not a
 * third opinion: [LinksnapRepository.links] answers from the database and is
 * awaited *first*, so the frame after the shell's is the rows the last pull
 * wrote — a cold launch with the radio off paints from here. The drain and the
 * pull run beside them and never in front of them: a failure is a
 * [SyncPillState], not an empty list.
 *
 * Every signed-in write commits the row **and** its replay intent in one
 * transaction, so what the user sees happen has already survived the process
 * before the request is attempted. The queue also drains with the app closed
 * ([com.royaraqamia.app.sync.OutboxDrainWorker]) and on reconnection
 * ([com.royaraqamia.app.shell.ShellActivity]), which is what makes an offline
 * write reach the server without this screen being open.
 *
 * A guest's link is only meaningful on the server, so it is the public
 * shortener's answer rather than a queued write; offline, the form says it needs
 * a connection. The unlock screen is the same kind of live read
 * ([LinksnapUnlockScreen]).
 *
 * What the site draws and this slice does not: the analytics drawer, the QR
 * modal, the share sheet and bulk selection. They are listed in the pull request
 * that landed the screen rather than implied by a missing button.
 */
@Composable
fun LinksnapScreen(
    repository: LinksnapRepository,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<LinksnapUiState>(LinksnapUiState.Painted(emptyList())) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }
    var urlInput by remember { mutableStateOf("") }
    var codeInput by remember { mutableStateOf("") }
    var passwordInput by remember { mutableStateOf("") }
    var notice by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var editing by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var deleting by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var undo by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var busy by remember { mutableStateOf(false) }

    /** Repaint from the store alone: no network, no session, no wait. */
    suspend fun paint() {
        state = LinksnapUiState.of(if (signedIn) repository.links() else emptyList())
    }

    /**
     * The delivery half: drain what is queued, then pull what is new.
     *
     * A radio that is off is not a failed sync — it is the pill's Offline state,
     * and the queued count comes from the queue itself rather than from a guess.
     */
    suspend fun sync() {
        paint()
        if (!signedIn) {
            pill = null
            return
        }
        if (!Connectivity.isOnline(context)) {
            pill = SyncPillState.Offline(repository.outboxStatus().pending)
            return
        }
        pill = SyncPillState.Syncing
        val report = repository.drain()
        val pulled = repository.pull()
        paint()
        pill =
            when {
                report.failed > 0 -> SyncPillState.Failed(report.failed)
                pulled is ApiResult.Failure -> SyncPillState.RefreshFailed
                report.pending > 0 -> SyncPillState.Pending(report.pending)
                else -> null
            }
    }

    LaunchedEffect(repository, signedIn) { sync() }

    // The radio returning is the trigger "a queued write drains", so this screen
    // hears it too rather than waiting for a recomposition that may never come.
    DisposableEffect(repository) {
        val watch = Connectivity.watch(context) { scope.launch { sync() } }
        onDispose { watch.close() }
    }

    fun submit() {
        if (busy) return
        scope.launch {
            busy = true
            notice = null
            try {
                val row =
                    if (signedIn) {
                        runCatching {
                                repository.createLink(
                                    originalUrl = urlInput,
                                    customCode = codeInput.takeIf { it.isNotBlank() },
                                    password = passwordInput.takeIf { it.isNotBlank() },
                                )
                            }
                            .getOrElse {
                                notice = it.message ?: "تعذَّر إنشاء الرَّابط."
                                null
                            }
                    } else {
                        when (
                            val answer =
                                repository.createOnlineLink(
                                    originalUrl = urlInput,
                                    customCode = codeInput.takeIf { it.isNotBlank() },
                                    password = passwordInput.takeIf { it.isNotBlank() },
                                )
                        ) {
                            is ApiResult.Success -> answer.value
                            is ApiResult.Failure -> {
                                notice = messageFor(answer.error)
                                null
                            }
                        }
                    }
                if (row != null) {
                    created = row
                    urlInput = ""
                    codeInput = ""
                    passwordInput = ""
                    if (signedIn) sync()
                }
            } finally {
                busy = false
            }
        }
    }

    val rows = (state as? LinksnapUiState.Painted)?.rows.orEmpty()
    val fullUrl: (String) -> String = { code -> "${siteUrl.trimEnd('/')}/$code" }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Text(
                    text = LinksnapPageCopy.PAGE_TITLE,
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = 12.dp),
                )
            }

            if (signedIn) {
                pill?.let { current ->
                    item {
                        SyncPill(
                            state = current,
                            onRetry = {
                                scope.launch {
                                    repository.retryFailed()
                                    sync()
                                }
                            },
                        )
                    }
                }
            }

            item {
                ShortenerForm(
                    url = urlInput,
                    code = codeInput,
                    password = passwordInput,
                    busy = busy,
                    notice = notice,
                    onUrlChange = { urlInput = it },
                    onCodeChange = {
                        codeInput = it.replace(Regex("[^a-zA-Z0-9_-]"), "").take(16)
                    },
                    onPasswordChange = { passwordInput = it },
                    onSubmit = ::submit,
                )
            }

            created?.let { link ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = "رابطك المُختصَر جاهز!",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = fullUrl(link.code),
                            style = MaterialTheme.typography.bodyLarge,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        TextButton(onClick = { onCopy(fullUrl(link.code)) }) {
                            Text("نسخ الرَّابط")
                        }
                    }
                }
            }

            if (signedIn) {
                if (rows.isEmpty()) {
                    item { LinksnapEmptyState() }
                } else {
                    items(rows, key = { it.clientId }) { row ->
                        LinksnapRowCard(
                            row = row,
                            onCopy = { onCopy(fullUrl(row.code)) },
                            onEdit = { editing = row },
                            onDelete = { deleting = row },
                        )
                    }
                }
            } else {
                item {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.large,
                    ) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = "سجِّل الدُّخول لإدارة روابطك ومزامنتها.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            TextButton(onClick = onSignIn) { Text("تسجيل الدُّخول") }
                        }
                    }
                }
            }

            undo?.let { removed ->
                item {
                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant,
                        shape = MaterialTheme.shapes.large,
                        modifier = Modifier.fillMaxWidth().testTag("linksnap-undo"),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = "تم حذف الرَّابط",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        repository.restoreLink(removed.clientId)
                                        undo = null
                                        sync()
                                    }
                                }
                            ) {
                                Text("تراجع")
                            }
                        }
                    }
                }
            }
        }
    }

    editing?.let { row ->
        LinksnapEditDialog(
            row = row,
            onDismiss = { editing = null },
            onSave = { edit ->
                editing = null
                scope.launch {
                    runCatching { repository.updateLink(row.clientId, edit) }
                        .onFailure { notice = it.message ?: "تعذَّر تعديل الرَّابط." }
                    sync()
                }
            },
        )
    }

    deleting?.let { row ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("حذف الرَّابط") },
            text = { Text("هل أنت متأكد من حذف هذا الرَّابط المُختصَر؟") },
            confirmButton = {
                TextButton(
                    onClick = {
                        deleting = null
                        scope.launch {
                            if (repository.deleteLink(row.clientId)) undo = row
                            sync()
                        }
                    }
                ) {
                    Text("حذف")
                }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }) { Text("إلغاء") }
            },
        )
    }
}

@Composable
private fun ShortenerForm(
    url: String,
    code: String,
    password: String,
    busy: Boolean,
    notice: String?,
    onUrlChange: (String) -> Unit,
    onCodeChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = url,
            onValueChange = onUrlChange,
            label = { Text("الرَّابط") },
            placeholder = { Text("https://example.com/very-long-url-path") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("linksnap-url"),
        )
        OutlinedTextField(
            value = code,
            onValueChange = onCodeChange,
            label = { Text("رمز مُخصَّص (اختياري)") },
            placeholder = { Text("my-promo") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("linksnap-code"),
        )
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            label = { Text("كلمة مرور (اختياري)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().testTag("linksnap-password"),
        )
        Button(
            onClick = onSubmit,
            enabled = !busy && url.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(if (busy) "جاري الاختصار..." else "اختصار الرَّابط")
        }
        notice?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun LinksnapRowCard(
    row: LinksnapLinkRow,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = MaterialTheme.shapes.large,
        modifier = Modifier.fillMaxWidth().testTag("linksnap-row"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = "/${row.code}",
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Text(
                    text = statusLabel(row),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                text = row.originalUrl,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (row.passwordProtected) {
                Text(
                    text = "محمي بكلمة مرور",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = onCopy) { Text("نسخ") }
                TextButton(onClick = onEdit) { Text("تعديل") }
                TextButton(onClick = onDelete) { Text("حذف") }
            }
        }
    }
}

@Composable
private fun LinksnapEditDialog(
    row: LinksnapLinkRow,
    onDismiss: () -> Unit,
    onSave: (LinksnapEdit) -> Unit,
) {
    var url by remember(row.clientId) { mutableStateOf(row.originalUrl) }
    var code by remember(row.clientId) { mutableStateOf(row.code) }
    var expiry by remember(row.clientId) { mutableStateOf(row.expiresAt?.take(10).orEmpty()) }
    var clearExpiry by remember(row.clientId) { mutableStateOf(false) }
    var password by remember(row.clientId) { mutableStateOf("") }
    var clearPassword by remember(row.clientId) { mutableStateOf(false) }
    var error by remember(row.clientId) { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("تعديل الرَّابط") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = url,
                    onValueChange = { url = it },
                    label = { Text("الرَّابط") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = code,
                    onValueChange = {
                        code = it.replace(Regex("[^a-zA-Z0-9_-]"), "").take(16)
                    },
                    label = { Text("الرمز") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = expiry,
                    onValueChange = { expiry = it; clearExpiry = false },
                    label = { Text("تاريخ الانتهاء (YYYY-MM-DD)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = clearExpiry,
                        onCheckedChange = {
                            clearExpiry = it
                            if (it) expiry = ""
                        },
                    )
                    Text("إزالة تاريخ الانتهاء")
                }
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; clearPassword = false },
                    label = { Text("كلمة مرور جديدة") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = clearPassword,
                        onCheckedChange = {
                            clearPassword = it
                            if (it) password = ""
                        },
                    )
                    Text("إزالة كلمة المرور")
                }
                error?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val iso =
                        if (clearExpiry || expiry.isBlank()) {
                            null
                        } else {
                            parseExpiry(expiry) ?: run {
                                error = "تاريخ غير صالح، استخدم YYYY-MM-DD."
                                return@TextButton
                            }
                        }
                    onSave(
                        LinksnapEdit(
                            newCode = code.takeIf { it != row.code },
                            originalUrl = url,
                            expiresAtSet = clearExpiry || expiry.isNotBlank(),
                            expiresAt = iso,
                            passwordSet = clearPassword || password.isNotBlank(),
                            password = if (clearPassword) null else password.takeIf { it.isNotBlank() },
                        )
                    )
                }
            ) {
                Text("حفظ")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("إلغاء") }
        },
    )
}

private fun parseExpiry(value: String): String? =
    runCatching {
            LocalDate.parse(value.trim())
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant()
                .toString()
        }
        .getOrNull()

private fun statusLabel(row: LinksnapLinkRow): String =
    when (LinksnapStatus.of(row, System.currentTimeMillis())) {
        "blocked" -> "محظور"
        "expired" -> "منتهي الصلاحية"
        else -> "نشط"
    }

private fun messageFor(error: ApiError): String =
    when (error) {
        is ApiError.Network -> "يتطلَّب الاتصال بالإنترنت. تحقَّق من اتِّصالك ثم أعد المحاولة."
        ApiError.NotSignedIn -> "سجِّل الدُّخول للمتابعة."
        is ApiError.Server -> serverMessage(error)
        is ApiError.InvalidContract -> "تعذَّر قراءة رد الخادم."
    }

private fun serverMessage(error: ApiError.Server): String {
    val named =
        runCatching {
                Json.parseToJsonElement(error.detail).jsonObject["error"]?.jsonPrimitive?.content
            }
            .getOrNull()
    return named?.takeIf { it.isNotBlank() } ?: "تعذَّرت العملية. حاول مرَّة أخرى."
}
