package com.royaraqamia.app.account

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * What the member the card draws is, before a dialog is opened (#946).
 *
 * The values are the page's own: the profile row's name and avatar plus the
 * account's email. A read that has not answered yet is not a face of the card -
 * the screen draws its skeleton - and a read that failed leaves `null`s, which
 * is what the page shows when its profile read fails rather than a second
 * sentence the site never says (ADR-0031).
 */
data class AccountProfile(
    val name: String?,
    val email: String?,
    val avatarUrl: String?,
)

/** The boxes and controls the card's own tests press, named once (#946). */
object AccountProfileMetrics {
    const val CARD = "account-profile-card"
    const val AVATAR = "account-profile-avatar"
    const val NAME = "account-profile-name"
    const val EMAIL = "account-profile-email"

    const val EDIT_NAME = "account-profile-edit-name"
    const val NAME_FIELD = "account-profile-name-field"
    const val SAVE_NAME = "account-profile-save-name"
    const val CANCEL_NAME = "account-profile-cancel-name"
    const val CHANGE_AVATAR = "account-profile-change-avatar"
    const val REMOVE_AVATAR = "account-profile-remove-avatar"
    const val CONFIRM_REMOVE = "account-profile-confirm-remove"
    const val CANCEL_AVATAR = "account-profile-cancel-avatar"
}

/**
 * The account page's profile card (#946), ported from
 * `frontend/ui/account/profile-editor.tsx`.
 *
 * The page draws the member's avatar, name and email, and owns two dialogs: the
 * name is edited in one and the avatar is replaced or removed in the other, with
 * the page's own question before a removal. This is the same card, on the same
 * routes: [AccountProfileRepository.profile] reads `/api/me`, the writes are the
 * page's `PATCH /api/me/name`, `POST /api/me/avatar` and `DELETE /api/me/avatar`,
 * so a change made here is the row the page reads back (#946, ADR-0098).
 *
 * The words come from [AccountProfileCopy], generated from
 * `shared/copy/account-profile.json`; nothing user-facing is retyped here.
 * [AccountProfileUiState] is the card's four faces, which is what
 * `docs/mobile/parity.json` holds against the page's `ProfileEditor`.
 */
@Composable
fun AccountProfileCard(
    profile: AccountProfile,
    repository: AccountProfileRepository,
    modifier: Modifier = Modifier,
    onChanged: (AccountProfile) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val spacing = LocalRoySpacing.current

    var live by remember(profile) { mutableStateOf(profile) }
    var face by remember { mutableStateOf<AccountProfileUiState>(AccountProfileUiState.AtRest) }
    var nameValue by remember { mutableStateOf("") }
    var nameError by remember { mutableStateOf<String?>(null) }
    var savingName by remember { mutableStateOf(false) }
    var uploading by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf(false) }
    var avatarError by remember { mutableStateOf<String?>(null) }

    fun update(next: AccountProfile) {
        live = next
        onChanged(next)
    }

    fun openName() {
        nameValue = live.name.orEmpty()
        nameError = null
        face = AccountProfileUiState.EditingName
    }

    fun saveName() {
        if (savingName) return
        val trimmed = nameValue.trim()
        if (trimmed.isEmpty()) {
            nameError = AccountProfileCopy.NAME_REQUIRED
            return
        }
        if (trimmed.length > NAME_LENGTH) {
            nameError = AccountProfileCopy.NAME_TOO_LONG
            return
        }

        savingName = true
        nameError = null
        scope.launch {
            val answer = runCatching { repository.updateName(trimmed) }.getOrNull()
            savingName = false
            when (answer) {
                is ApiResult.Success -> {
                    update(live.copy(name = answer.value.name?.trim()?.takeIf { it.isNotEmpty() } ?: trimmed))
                    face = AccountProfileUiState.AtRest
                }
                is ApiResult.Failure ->
                    nameError = answer.error.messageOrNull() ?: AccountProfileCopy.NAME_FAILED
                null -> nameError = AccountProfileCopy.NAME_FAILED
            }
        }
    }

    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
            if (uri == null) return@rememberLauncherForActivityResult
            scope.launch {
                avatarError = null
                val file = withContext(Dispatchers.IO) { readAvatar(context, uri) }
                when {
                    file == null -> avatarError = AccountProfileCopy.INVALID_IMAGE
                    file.bytes.size > AccountProfileRepository.AVATAR_MAX_BYTES ->
                        avatarError = AccountProfileCopy.IMAGE_TOO_LARGE
                    else -> {
                        uploading = true
                        val answer = runCatching { repository.uploadAvatar(file) }.getOrNull()
                        uploading = false
                        when (answer) {
                            is ApiResult.Success -> {
                                update(live.copy(avatarUrl = answer.value.avatarUrl ?: live.avatarUrl))
                                avatarError = null
                                face = AccountProfileUiState.AtRest
                            }
                            is ApiResult.Failure -> {
                                avatarError =
                                    answer.error.messageOrNull() ?: AccountProfileCopy.AVATAR_FAILED
                            }
                            null -> {
                                avatarError = AccountProfileCopy.AVATAR_FAILED
                            }
                        }
                    }
                }
            }
        }

    fun removeAvatar() {
        if (removing) return
        removing = true
        avatarError = null
        scope.launch {
            val answer = runCatching { repository.removeAvatar() }.getOrNull()
            removing = false
            when (answer) {
                is ApiResult.Success -> {
                    update(live.copy(avatarUrl = null))
                    face = AccountProfileUiState.AtRest
                }
                is ApiResult.Failure -> {
                    avatarError = answer.error.messageOrNull() ?: AccountProfileCopy.AVATAR_REMOVE_FAILED
                    face = AccountProfileUiState.EditingAvatar
                }
                null -> {
                    avatarError = AccountProfileCopy.AVATAR_REMOVE_FAILED
                    face = AccountProfileUiState.EditingAvatar
                }
            }
        }
    }

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(Recipes.Card.radius)
                .background(Recipes.Card.container)
                .border(Recipes.Card.border, Recipes.Card.radius)
                .padding(spacing.elementGap)
                .testTag(AccountProfileMetrics.CARD),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AvatarButton(
            name = live.name,
            avatarUrl = live.avatarUrl,
            loader = repository,
            uploading = uploading,
            onClick = {
                avatarError = null
                face = AccountProfileUiState.EditingAvatar
            },
        )

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = displayName(live),
                    style = LocalRoyTypeScale.current.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f).testTag(AccountProfileMetrics.NAME),
                )
                EditNameButton(onClick = ::openName)
            }
            Text(
                text = live.email?.trim()?.takeIf { it.isNotEmpty() }
                    ?: AccountProfileCopy.ACTIVE_ACCOUNT,
                style = LocalRoyTypeScale.current.xs,
                color = RoyColors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.testTag(AccountProfileMetrics.EMAIL),
            )
        }
    }

    if (face is AccountProfileUiState.EditingName) {
        NameDialog(
            value = nameValue,
            error = nameError,
            saving = savingName,
            onValueChange = {
                nameValue = it
                if (nameError != null) nameError = null
            },
            onSave = ::saveName,
            onDismiss = { face = AccountProfileUiState.AtRest },
        )
    }

    if (face is AccountProfileUiState.EditingAvatar || face is AccountProfileUiState.ConfirmingRemoval) {
        AvatarDialog(
            name = live.name,
            avatarUrl = live.avatarUrl,
            loader = repository,
            uploading = uploading,
            removing = removing,
            error = avatarError,
            confirmingRemoval = face is AccountProfileUiState.ConfirmingRemoval,
            onUpload = { picker.launch("image/*") },
            onAskRemove = { face = AccountProfileUiState.ConfirmingRemoval },
            onCancelAskRemove = { face = AccountProfileUiState.EditingAvatar },
            onRemove = ::removeAvatar,
            onDismiss = { face = AccountProfileUiState.AtRest },
        )
    }
}

/** The page's skeleton for the card: one block where the card lands. */
@Composable
internal fun AccountProfileSkeleton(modifier: Modifier = Modifier) {
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(88.dp)
                .clip(Recipes.Skeleton.radius)
                .background(RoyColors.muted.copy(alpha = 0.4f)),
    )
}

/** The member's name exactly as the page chooses it, with its two fallbacks. */
private fun displayName(profile: AccountProfile): String =
    profile.name?.trim()?.takeIf { it.isNotEmpty() }
        ?: profile.email?.trim()?.takeIf { it.isNotEmpty() }
        ?: AccountProfileCopy.DEFAULT_NAME

/** The page's avatar: the picture the loader answers, or the initial and its badge. */
@Composable
private fun AvatarButton(
    name: String?,
    avatarUrl: String?,
    loader: AvatarLoader,
    uploading: Boolean,
    onClick: () -> Unit,
) {
    val label =
        if (avatarUrl.isNullOrBlank()) AccountProfileCopy.ADD_AVATAR else AccountProfileCopy.EDIT_AVATAR

    Box {
        Box(
            modifier =
                Modifier.size(56.dp)
                    .clip(CircleShape)
                    .clickable(onClick = onClick)
                    .semantics {
                        contentDescription = label
                    }
                    .testTag(AccountProfileMetrics.AVATAR),
        ) {
            if (name.isNullOrBlank() && avatarUrl.isNullOrBlank()) {
                // The page's last fallback: an account with no name and no picture
                // is the site's own `User` glyph, not a blank circle.
                Box(
                    modifier = Modifier.matchParentSize().clip(CircleShape)
                        .background(RoyColors.muted.copy(alpha = 0.6f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = LucideVectors.User,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(24.dp),
                    )
                }
            } else {
                AccountAvatar(
                    name = name,
                    avatarUrl = avatarUrl,
                    loader = loader,
                    size = 56.dp,
                    modifier = Modifier.matchParentSize(),
                )
            }
            if (uploading) {
                Box(
                    modifier = Modifier.matchParentSize().clip(CircleShape)
                        .background(RoyColors.background.copy(alpha = 0.7f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Spinner()
                }
            }
        }

        Box(
            modifier =
                Modifier.align(Alignment.BottomEnd)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(RoyColors.primary),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.Camera,
                contentDescription = null,
                tint = RoyColors.primaryForeground,
                modifier = Modifier.size(12.dp),
            )
        }
    }
}

/** The pencil beside the name: the site's small bordered control. */
@Composable
private fun EditNameButton(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = Modifier.size(28.dp).testTag(AccountProfileMetrics.EDIT_NAME),
        shape = RoundedCornerShape(8.dp),
        color = RoyColors.card.copy(alpha = 0.6f),
        border = BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.5f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = LucideVectors.Pencil,
                contentDescription = AccountProfileCopy.EDIT_NAME,
                tint = RoyColors.foreground,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

/** The name dialog: the page's label, field, error and save action. */
@Composable
private fun NameDialog(
    value: String,
    error: String?,
    saving: Boolean,
    onValueChange: (String) -> Unit,
    onSave: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = { if (!saving) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        DialogCard {
            androidx.compose.material3.OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                label = { Text(AccountProfileCopy.NAME_LABEL) },
                singleLine = true,
                isError = error != null,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                modifier = Modifier.fillMaxWidth().testTag(AccountProfileMetrics.NAME_FIELD),
            )
            if (error != null) {
                Text(
                    text = error,
                    style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Medium),
                    color = RoyColors.destructive,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(top = LocalRoySpacing.current.elementGapSm),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onDismiss,
                    enabled = !saving,
                    modifier = Modifier.testTag(AccountProfileMetrics.CANCEL_NAME),
                ) {
                    Text(AccountProfileCopy.CANCEL, color = RoyColors.mutedForeground)
                }
                Button(
                    onClick = onSave,
                    enabled = !saving,
                    modifier = Modifier.testTag(AccountProfileMetrics.SAVE_NAME),
                ) {
                    if (saving) Spinner(size = 16.dp, tint = Color.White)
                    Text(
                        text = if (saving) AccountProfileCopy.SAVING else AccountProfileCopy.SAVE,
                        modifier = Modifier.padding(start = if (saving) 6.dp else 0.dp),
                    )
                }
            }
        }
    }
}

/** The avatar dialog and, inside it, the page's question before a removal. */
@Composable
private fun AvatarDialog(
    name: String?,
    avatarUrl: String?,
    loader: AvatarLoader,
    uploading: Boolean,
    removing: Boolean,
    error: String?,
    confirmingRemoval: Boolean,
    onUpload: () -> Unit,
    onAskRemove: () -> Unit,
    onCancelAskRemove: () -> Unit,
    onRemove: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = { if (!uploading && !removing) onDismiss() },
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        DialogCard {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    AccountAvatar(
                        name = name,
                        avatarUrl = avatarUrl,
                        loader = loader,
                        size = 112.dp,
                    )
                    if (uploading) {
                        Box(
                            modifier = Modifier.size(112.dp).clip(CircleShape)
                                .background(RoyColors.background.copy(alpha = 0.7f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Spinner(size = 24.dp)
                        }
                    }
                }
                Text(
                    text = AccountProfileCopy.IMAGE_LIMIT,
                    style = LocalRoyTypeScale.current.xs,
                    color = RoyColors.mutedForeground,
                )
                if (error != null) {
                    Text(
                        text = error,
                        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Medium),
                        color = RoyColors.destructive,
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth().padding(top = LocalRoySpacing.current.elementGapSm),
                horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onDismiss,
                    enabled = !uploading && !removing,
                    modifier = Modifier.testTag(AccountProfileMetrics.CANCEL_AVATAR),
                ) {
                    Text(AccountProfileCopy.CANCEL, color = RoyColors.mutedForeground)
                }
                if (!avatarUrl.isNullOrBlank()) {
                    TextButton(
                        onClick = onAskRemove,
                        enabled = !uploading && !removing,
                        modifier = Modifier.testTag(AccountProfileMetrics.REMOVE_AVATAR),
                    ) {
                        if (removing) {
                            Spinner(size = 16.dp)
                        } else {
                            Icon(
                                imageVector = LucideVectors.Trash2,
                                contentDescription = null,
                                tint = RoyColors.destructive,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                        Text(
                            text =
                                if (removing) AccountProfileCopy.REMOVING
                                else AccountProfileCopy.REMOVE_AVATAR,
                            color = RoyColors.destructive,
                            modifier = Modifier.padding(start = 6.dp),
                        )
                    }
                }
                Button(
                    onClick = onUpload,
                    enabled = !uploading && !removing,
                    modifier = Modifier.testTag(AccountProfileMetrics.CHANGE_AVATAR),
                ) {
                    Text(
                        text =
                            when {
                                uploading -> AccountProfileCopy.UPLOADING
                                avatarUrl.isNullOrBlank() -> AccountProfileCopy.UPLOAD_AVATAR
                                else -> AccountProfileCopy.CHANGE_AVATAR
                            }
                    )
                }
            }
        }
    }

    if (confirmingRemoval) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = onCancelAskRemove,
            title = { Text(AccountProfileCopy.REMOVE_AVATAR) },
            text = { Text(AccountProfileCopy.REMOVE_MESSAGE) },
            confirmButton = {
                TextButton(
                    onClick = onRemove,
                    enabled = !removing,
                    modifier = Modifier.testTag(AccountProfileMetrics.CONFIRM_REMOVE),
                ) {
                    Text(AccountProfileCopy.CONFIRM_DELETE, color = RoyColors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = onCancelAskRemove, enabled = !removing) {
                    Text(AccountProfileCopy.CANCEL)
                }
            },
        )
    }
}

/** The site's dialog surface: the dialog's own card, at the app's width. */
@Composable
private fun DialogCard(content: @Composable () -> Unit) {
    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(RoyColors.background)
                    .border(1.dp, RoyColors.border.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
                    .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            content()
        }
    }
}

/** The site's `LoaderCircle`, turning: the card's busy mark. */
@Composable
private fun Spinner(size: Dp = 16.dp, tint: Color = RoyColors.primary) {
    val transition = rememberInfiniteTransition(label = "profile-spinner")
    val angle by
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 360f,
            animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing)),
            label = "profile-spinner-angle",
        )
    Icon(
        imageVector = LucideVectors.Loader2,
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(size).rotate(angle),
    )
}

/** One avatar pick's bytes and the two fields the route reads. */
private fun readAvatar(context: Context, uri: Uri): AvatarUpload? =
    try {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri)?.takeIf { it.startsWith("image/") }
        if (mime == null) {
            null
        } else {
            var name: String? = null
            resolver
                .query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor ->
                    if (cursor.moveToFirst()) {
                        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                        if (index >= 0) name = cursor.getString(index)
                    }
                }
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
            AvatarUpload(fileName = name ?: "avatar", mimeType = mime, bytes = bytes)
        }
    } catch (_: Exception) {
        null
    }

/** The server's own sentence when it refused, or nothing when it did not say. */
private fun ApiError.messageOrNull(): String? =
    when (this) {
        is ApiError.Server ->
            Regex("\"error\"\\s*:\\s*\"([^\"]+)\"").find(detail)?.groupValues?.getOrNull(1)
        else -> null
    }

/** The page's own name ceiling (`ProfileNameSchema`). */
private const val NAME_LENGTH = 80
