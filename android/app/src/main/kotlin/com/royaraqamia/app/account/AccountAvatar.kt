package com.royaraqamia.app.account

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** The handles a test presses, named once (#945). */
object AccountAvatarTags {
    const val AVATAR = "account-avatar"
}

/**
 * The member's avatar: the image when it reads, the initial letter when it does
 * not (#945).
 *
 * The web's `ProfileEditor` draws the same two faces — the picture, or the first
 * letter of the name in the accent colour — and the fallback is deliberate: a
 * failed read is a letter, never a hole, so the card still says whose it is. The
 * bytes come from [AvatarLoader] on IO; the decode happens off the main thread,
 * and the screen never learns the URL was a network read.
 *
 * A blank or absent URL draws the initial immediately; a URL whose read fails
 * does the same once the loader answers, because [image] stays null.
 */
@Composable
fun AccountAvatar(
    name: String?,
    avatarUrl: String?,
    loader: AvatarLoader,
    modifier: Modifier = Modifier,
    size: Dp = 56.dp,
) {
    val initial = remember(name) { name?.trim()?.firstOrNull()?.uppercase() }
    var image by remember(avatarUrl) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(avatarUrl) {
        image = null
        val url = avatarUrl?.trim().orEmpty()
        if (url.isEmpty()) return@LaunchedEffect

        val bytes = loader.load(url) ?: return@LaunchedEffect
        image =
            withContext(Dispatchers.Default) {
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
            }
    }

    Box(
        modifier =
            modifier
                .size(size)
                .clip(CircleShape)
                .background(RoyColors.muted.copy(alpha = 0.6f))
                .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), CircleShape)
                .testTag(AccountAvatarTags.AVATAR),
        contentAlignment = Alignment.Center,
    ) {
        val loaded = image
        when {
            loaded != null ->
                Image(
                    bitmap = loaded,
                    contentDescription = name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                )

            initial != null ->
                Text(
                    text = initial,
                    style = LocalRoyTypeScale.current.h2.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.primary,
                )

            else ->
                Icon(
                    imageVector = LucideVectors.User,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(size * 0.5f),
                )
        }
    }
}
