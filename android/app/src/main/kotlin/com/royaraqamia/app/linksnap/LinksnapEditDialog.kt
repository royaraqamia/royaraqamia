package com.royaraqamia.app.linksnap

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.linksnap.LinksnapEdit
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The owned link's edit dialog (#944), ported from
 * `frontend/ui/linksnap/link-edit-dialog.tsx`.
 *
 * The page edits four things: the destination, the slug (with a debounced
 * availability check), the expiry and the password. The app writes them through
 * [LinksnapRepository.updateLink], which puts the row and its `link.update`
 * intent in one transaction, so the edit paints before the network answers and
 * drains after a process kill (ADR-0027, ADR-0029).
 *
 * The slug check is the site's: the query is the sanitized slug, the wait is
 * 400 ms, and it is skipped while the radio is off or the slug is under three
 * characters. [LinksnapEditUiState] is the five faces both clients draw.
 *
 * The gate's `edit` state measures the header (`shared/visual/account-links.json`):
 * the page's title and instruction in the box the dialog draws them in. The rest
 * of the form is the page's fields in the page's words, measured by the adapter
 * rather than by a raster.
 */
@Composable
fun LinksnapEditDialog(
    row: LinksnapLinkRow,
    siteUrl: String,
    online: Boolean,
    repository: LinksnapRepository,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
    onCopy: (String) -> Unit = {},
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties =
            DialogProperties(
                usePlatformDefaultWidth = false,
                dismissOnBackPress = true,
                dismissOnClickOutside = true,
            ),
    ) {
        LinksnapEditContent(
            row = row,
            siteUrl = siteUrl,
            online = online,
            onDismiss = onDismiss,
            onSaved = onSaved,
            onCopy = onCopy,
            onCheckAvailability = { code ->
                when (val answer = repository.checkAvailability(code)) {
                    is ApiResult.Success ->
                        if (answer.value.available) LinksnapEditUiState.Available
                        else LinksnapEditUiState.Taken
                    is ApiResult.Failure ->
                        when (answer.error) {
                            is ApiError.Network -> LinksnapEditUiState.Offline
                            else -> LinksnapEditUiState.Idle
                        }
                }
            },
            onSave = { edit ->
                runCatching { repository.updateLink(row.clientId, edit) ?: error("not found") }
                    .fold(onSuccess = { null }, onFailure = { it.message })
            },
        )
    }
}

/**
 * The dialog's content, separate from the window so the visual gate can draw the
 * same boxes inside its own viewport instead of a second window's bounds.
 */
@Composable
internal fun LinksnapEditContent(
    row: LinksnapLinkRow,
    siteUrl: String,
    online: Boolean,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    onSaved: () -> Unit = {},
    onCopy: (String) -> Unit = {},
    onCheckAvailability: suspend (String) -> LinksnapEditUiState = {
        LinksnapEditUiState.Idle
    },
    onSave: suspend (LinksnapEdit) -> String? = { null },
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var url by remember(row.clientId) { mutableStateOf(row.originalUrl) }
    var code by remember(row.clientId) { mutableStateOf(row.code) }
    val initialExpiry = remember(row.clientId) { splitExpiry(row.expiresAt) }
    var expiryEnabled by remember(row.clientId) { mutableStateOf(initialExpiry != null) }
    var expiryDate by remember(row.clientId) {
        mutableStateOf(initialExpiry?.first ?: LocalDate.now().toString())
    }
    var expiryTime by remember(row.clientId) {
        mutableStateOf(initialExpiry?.second ?: "23:59")
    }
    var passwordEnabled by remember(row.clientId) { mutableStateOf(row.passwordProtected) }
    var password by remember(row.clientId) { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }
    var availability by remember(row.clientId) {
        mutableStateOf<LinksnapEditUiState>(LinksnapEditUiState.Idle)
    }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    val isCurrent = code == row.code
    val hasChanges =
        url.trim() != row.originalUrl.trim() ||
            code.trim() != row.code ||
            passwordEnabled != row.passwordProtected ||
            password.isNotEmpty() ||
            expiryEnabled != (row.expiresAt != null) ||
            (expiryEnabled &&
                (initialExpiry?.first != expiryDate || initialExpiry?.second != expiryTime))

    LaunchedEffect(code, online) {
        val slug = sanitizeSlug(code)
        availability =
            when {
                slug == row.code -> LinksnapEditUiState.Available
                slug.length < 3 -> LinksnapEditUiState.Idle
                !online -> LinksnapEditUiState.Offline
                else -> {
                    availability = LinksnapEditUiState.Checking
                    delay(400)
                    onCheckAvailability(slug)
                }
            }
    }

    LaunchedEffect(copied) {
        if (copied) {
            delay(2_000)
            copied = false
        }
    }

    fun save() {
        if (saving) return
        if (availability == LinksnapEditUiState.Taken) {
            error = LinksnapEditCopy.SLUG_TAKEN
            return
        }
        if (passwordEnabled && password.isEmpty() && !row.passwordProtected) {
            error = LinksnapEditCopy.PASSWORD_REQUIRED
            return
        }
        val expiresAt =
            if (expiryEnabled) {
                runCatching {
                        LocalDateTime.of(
                                LocalDate.parse(expiryDate),
                                LocalTime.parse(expiryTime.ifEmpty { "23:59" }),
                            )
                            .atZone(ZoneId.systemDefault())
                            .toInstant()
                            .toString()
                    }
                    .getOrNull()
            } else null
        val edit =
            LinksnapEdit(
                newCode = code.trim().takeIf { it != row.code },
                originalUrl = url.trim(),
                expiresAt = expiresAt,
                expiresAtSet = true,
                password =
                    when {
                        !passwordEnabled -> null
                        password.isNotEmpty() -> password
                        else -> null
                    },
                passwordSet = passwordEnabled != row.passwordProtected || password.isNotEmpty(),
            )
        scope.launch {
            saving = true
            error = null
            val message = onSave(edit)
            saving = false
            if (message == null) {
                onSaved()
                onDismiss()
            } else {
                error = message
            }
        }
    }

    Column(
        modifier =
            modifier
                .testTag(LinksnapEditMetrics.DIALOG)
                .width(LinksnapEditMetrics.dialogWidth)
                .clip(RoundedCornerShape(LinksnapEditMetrics.dialogRadius))
                .background(RoyColors.background)
                .border(
                    LinksnapEditMetrics.borderWidth,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapEditMetrics.dialogRadius),
                ),
    ) {
        EditHeader()

        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .heightIn(max = LinksnapEditMetrics.bodyMaxHeight)
                    .verticalScroll(rememberScrollState())
                    .padding(LinksnapEditMetrics.bodyPadding),
            verticalArrangement = Arrangement.spacedBy(LinksnapEditMetrics.fieldGap),
        ) {
            FieldLabel(icon = LucideVectors.Globe, label = LinksnapEditCopy.URL_LABEL)
            OutlinedTextField(
                value = url,
                onValueChange = { url = it },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag(LinksnapEditMetrics.URL),
                textStyle =
                    TextStyle(
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontFamily = FontFamily.Monospace,
                    ),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            )

            FieldLabel(icon = LucideVectors.Pencil, label = LinksnapEditCopy.SLUG_LABEL)
            OutlinedTextField(
                value = code,
                onValueChange = { code = sanitizeSlug(it) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().testTag(LinksnapEditMetrics.SLUG),
                textStyle =
                    TextStyle(
                        fontSize = 14.sp,
                        lineHeight = 20.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                    ),
            )
            SlugStatus(state = availability, isCurrent = isCurrent)

            ToggleCard(
                icon = LucideVectors.CalendarClock,
                title = LinksnapEditCopy.EXPIRY_TITLE,
                checked = expiryEnabled,
                onCheckedChange = { expiryEnabled = it },
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(LinksnapEditMetrics.fieldGap),
                ) {
                    PickerChip(
                        icon = LucideVectors.Calendar,
                        label = expiryDate,
                        onClick = {
                            val today = LocalDate.now()
                            DatePickerDialog(
                                    context,
                                    { _, year, month, day ->
                                        expiryDate = LocalDate.of(year, month + 1, day).toString()
                                    },
                                    today.year,
                                    today.monthValue - 1,
                                    today.dayOfMonth,
                                )
                                .show()
                        },
                    )
                    PickerChip(
                        icon = LucideVectors.Clock,
                        label = expiryTime,
                        onClick = {
                            TimePickerDialog(
                                    context,
                                    { _, hour, minute ->
                                        expiryTime =
                                            "%02d:%02d".format(hour, minute)
                                    },
                                    23,
                                    59,
                                    true,
                                )
                                .show()
                        },
                    )
                }
            }

            ToggleCard(
                icon = LucideVectors.KeyRound,
                title = LinksnapEditCopy.PASSWORD_TITLE,
                checked = passwordEnabled,
                onCheckedChange = { passwordEnabled = it },
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        singleLine = true,
                        modifier = Modifier.weight(1f).testTag(LinksnapEditMetrics.PASSWORD),
                        textStyle = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
                        placeholder = {
                            Text(
                                text =
                                    if (row.passwordProtected) {
                                        LinksnapEditCopy.PASSWORD_KEEP_PLACEHOLDER
                                    } else {
                                        LinksnapEditCopy.PASSWORD_PLACEHOLDER
                                    },
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style =
                                    TextStyle(
                                        fontSize = 12.sp,
                                        lineHeight = 16.sp,
                                        color = RoyColors.mutedForeground,
                                    ),
                            )
                        },
                        visualTransformation =
                            if (showPassword) VisualTransformation.None
                            else PasswordVisualTransformation(),
                    )
                    IconButton(onClick = { showPassword = !showPassword }) {
                        Icon(
                            imageVector =
                                if (showPassword) LucideVectors.EyeOff else LucideVectors.Eye,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = RoyColors.mutedForeground,
                        )
                    }
                }
                if (row.passwordProtected) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = LucideVectors.ShieldCheck,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = RoyColors.success,
                        )
                        Text(
                            text = LinksnapEditCopy.PASSWORD_TITLE,
                            style =
                                TextStyle(
                                    fontSize = 11.sp,
                                    lineHeight = 16.sp,
                                    color = RoyColors.success,
                                ),
                        )
                    }
                }
            }

            error?.let { message ->
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(RoyColors.destructive.copy(alpha = 0.1f))
                            .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = LucideVectors.CircleAlert,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp),
                        tint = RoyColors.destructive,
                    )
                    Text(
                        text = message,
                        style =
                            TextStyle(
                                fontSize = 12.sp,
                                lineHeight = 16.sp,
                                color = RoyColors.destructive,
                            ),
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(onClick = onDismiss, enabled = !saving) {
                    Text(LinksnapEditCopy.CANCEL)
                }
                Spacer(Modifier.weight(1f))
                Button(
                    onClick = ::save,
                    enabled =
                        !saving &&
                            hasChanges &&
                            availability != LinksnapEditUiState.Taken &&
                            availability != LinksnapEditUiState.Checking &&
                            code.trim().length >= 3,
                ) {
                    if (saving) {
                        Icon(
                            imageVector = LucideVectors.LoaderCircle,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.size(6.dp))
                        Text(LinksnapEditCopy.SAVING)
                    } else {
                        Text(LinksnapEditCopy.SAVE)
                    }
                }
            }

            // The remaining glyphs the page's dialog draws, kept in the same
            // component so the pair list can name them (ADR-0100).
            LinksnapEditGlyphs(
                copied = copied,
                onCopy = {
                    onCopy("${siteUrl.trimEnd('/')}/${code.trim()}")
                    copied = true
                },
                onReset = {
                    url = row.originalUrl
                    code = row.code
                    password = ""
                    expiryEnabled = initialExpiry != null
                    expiryDate = initialExpiry?.first ?: LocalDate.now().toString()
                    expiryTime = initialExpiry?.second ?: "23:59"
                },
            )
        }
    }
}

@Composable
private fun EditHeader() {
    Row(
        modifier =
            Modifier.testTag(LinksnapEditMetrics.HEADER)
                .width(LinksnapEditMetrics.headerWidth)
                .height(LinksnapEditMetrics.headerHeight)
                .background(LinksnapEditMetrics.headerSurface)
                .padding(horizontal = LinksnapEditMetrics.headerPaddingX),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapEditMetrics.iconGap),
    ) {
        Box(
            modifier =
                Modifier.size(LinksnapEditMetrics.iconBox)
                    .clip(RoundedCornerShape(LinksnapEditMetrics.iconBoxRadius))
                    .background(RoyColors.primary.copy(alpha = 0.1f))
                    .border(
                        LinksnapEditMetrics.borderWidth,
                        RoyColors.primary.copy(alpha = 0.2f),
                        RoundedCornerShape(LinksnapEditMetrics.iconBoxRadius),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.Pencil,
                contentDescription = null,
                modifier = Modifier.size(LinksnapEditMetrics.headerIconSize),
                tint = RoyColors.primary,
            )
        }
        Column {
            Text(
                text = LinksnapEditCopy.TITLE,
                modifier =
                    Modifier.testTag(LinksnapEditMetrics.TITLE)
                        .height(LinksnapEditMetrics.titleHeight),
                style =
                    TextStyle(
                        fontSize = LinksnapEditMetrics.titleSize,
                        lineHeight = LinksnapEditMetrics.titleLineHeight,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                    ),
                maxLines = 1,
            )
            Spacer(Modifier.height(LinksnapEditMetrics.descriptionTopPadding))
            Text(
                text = LinksnapEditCopy.DESCRIPTION,
                modifier =
                    Modifier.testTag(LinksnapEditMetrics.DESCRIPTION)
                        .height(LinksnapEditMetrics.descriptionHeight),
                style =
                    TextStyle(
                        fontSize = LinksnapEditMetrics.descriptionSize,
                        lineHeight = LinksnapEditMetrics.descriptionLineHeight,
                        color = RoyColors.mutedForeground,
                    ),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun FieldLabel(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = RoyColors.primary,
        )
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = RoyColors.foreground,
                ),
        )
    }
}

@Composable
private fun SlugStatus(state: LinksnapEditUiState, isCurrent: Boolean) {
    val text =
        when (state) {
            LinksnapEditUiState.Idle -> LinksnapEditCopy.SLUG_HINT
            LinksnapEditUiState.Checking -> LinksnapEditCopy.SLUG_CHECKING
            LinksnapEditUiState.Available ->
                if (isCurrent) LinksnapEditCopy.SLUG_CURRENT else LinksnapEditCopy.SLUG_AVAILABLE
            LinksnapEditUiState.Taken -> LinksnapEditCopy.SLUG_TAKEN
            LinksnapEditUiState.Offline -> LinksnapEditCopy.SLUG_OFFLINE
        }
    val icon =
        when (state) {
            LinksnapEditUiState.Available -> LucideVectors.Check
            LinksnapEditUiState.Taken -> LucideVectors.CircleAlert
            LinksnapEditUiState.Offline -> LucideVectors.CloudOff
            LinksnapEditUiState.Checking -> LucideVectors.LoaderCircle
            LinksnapEditUiState.Idle -> null
        }
    val tint =
        when (state) {
            LinksnapEditUiState.Available -> RoyColors.success
            LinksnapEditUiState.Taken -> RoyColors.destructive
            else -> RoyColors.mutedForeground
        }
    Row(
        modifier = Modifier.testTag(LinksnapEditMetrics.STATUS),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        icon?.let {
            Icon(
                imageVector = it,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = tint,
            )
        }
        Text(
            text = text,
            style = TextStyle(fontSize = 11.sp, lineHeight = 16.sp, color = tint),
            maxLines = 2,
        )
    }
}

@Composable
private fun ToggleCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    content: @Composable () -> Unit,
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .border(
                    LinksnapEditMetrics.borderWidth,
                    if (checked) RoyColors.primary.copy(alpha = 0.3f) else RoyColors.border,
                    RoundedCornerShape(16.dp),
                )
                .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = if (checked) RoyColors.primary else RoyColors.mutedForeground,
            )
            Text(
                text = title,
                modifier = Modifier.weight(1f),
                style =
                    TextStyle(
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                    ),
            )
            Switch(checked = checked, onCheckedChange = onCheckedChange)
        }
        if (checked) content()
    }
}

@Composable
private fun PickerChip(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Row(
        modifier =
            Modifier.clip(RoundedCornerShape(10.dp))
                .border(1.dp, RoyColors.border, RoundedCornerShape(10.dp))
                .clickable(onClick = onClick)
                .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = RoyColors.mutedForeground,
        )
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = 12.sp,
                    lineHeight = 16.sp,
                    color = RoyColors.foreground,
                ),
        )
    }
}

@Composable
private fun LinksnapEditGlyphs(
    copied: Boolean,
    onCopy: () -> Unit,
    onReset: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = LucideVectors.Sparkles,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = RoyColors.primary,
        )
        Icon(
            imageVector = LucideVectors.Link2,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = RoyColors.primary,
        )
        Icon(
            imageVector = LucideVectors.ExternalLink,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = RoyColors.mutedForeground,
        )
        Spacer(Modifier.weight(1f))
        IconButton(onClick = onCopy, modifier = Modifier.size(28.dp)) {
            Icon(
                imageVector = if (copied) LucideVectors.CheckCheck else LucideVectors.Copy,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = RoyColors.mutedForeground,
            )
        }
        IconButton(onClick = onReset, modifier = Modifier.size(28.dp)) {
            Icon(
                imageVector = LucideVectors.RotateCcw,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = RoyColors.mutedForeground,
            )
        }
    }
}

/** `2026-11-08T23:59:00` -> the date and time the pickers show. */
private fun splitExpiry(value: String?): Pair<String, String>? {
    if (value.isNullOrEmpty()) return null
    return runCatching {
            val instant = Instant.parse(value)
            val zoned = instant.atZone(ZoneId.systemDefault())
            zoned.toLocalDate().toString() to
                zoned.toLocalTime().format(DateTimeFormatter.ofPattern("HH:mm"))
        }
        .getOrNull()
}

private fun sanitizeSlug(value: String): String =
    value.trim().replace(Regex("[^a-zA-Z0-9_-]"), "").take(16)

/**
 * The page numbers the gate compares for the `edit` state
 * (`shared/visual/account-links.json`, ADR-0118).
 *
 * The header is the dialog's own box: the page's `px-6 py-4.5` over a 36-high
 * icon beside a 24-high title and a 16-high instruction, with a 2 gap between
 * them, inside the dialog's 361-wide card. The rest of the form is the page's
 * fields; only the header is measured, because that is the part the dialog's
 * Radix container and the app's window do not share.
 */
internal object LinksnapEditMetrics {
    const val DIALOG = "linksnap-edit-dialog"
    const val HEADER = "linksnap-edit-header"
    const val TITLE = "linksnap-edit-title"
    const val DESCRIPTION = "linksnap-edit-description"
    const val URL = "linksnap-edit-url"
    const val SLUG = "linksnap-edit-slug"
    const val STATUS = "linksnap-edit-status"
    const val PASSWORD = "linksnap-edit-password"

    val dialogWidth = 361.dp
    val dialogRadius = 24.dp
    val borderWidth = 1.dp

    val headerWidth = 359.dp
    val headerHeight = 95.dp
    val headerPaddingX = 24.dp
    val headerSurface = Color(0x66171717)
    val iconBox = 36.dp
    val iconBoxRadius = 12.dp
    val headerIconSize = 16.dp
    val iconGap = 12.dp
    val titleHeight = 24.dp
    val titleSize = 16.sp
    val titleLineHeight = 24.sp
    val descriptionTopPadding = 2.dp
    val descriptionHeight = 32.dp
    val descriptionSize = 12.sp
    val descriptionLineHeight = 16.sp

    val bodyPadding = 20.dp
    val fieldGap = 12.dp
    val bodyMaxHeight = 620.dp
}
