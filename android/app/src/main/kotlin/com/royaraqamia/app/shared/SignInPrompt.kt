package com.royaraqamia.app.shared

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import com.royaraqamia.app.account.AccountRowsCopy
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/**
 * The site's guest gate, in the app's own alert.
 *
 * The account rows drew this privately until the follow and chat doors on a
 * public profile needed the same question. One prompt for both, so a guest is
 * not asked to sign in in two different voices — and the words stay the
 * account page's own generated copy, because it is the same sentence.
 *
 * [confirmTag] is the account screen's own handle on the confirm button; a
 * caller with no test of its own leaves it null.
 */
@Composable
fun SignInPrompt(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmTag: String? = null,
) {
    val type = LocalRoyTypeScale.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = AccountRowsCopy.SIGN_IN_PROMPT,
                style = type.small.copy(fontWeight = FontWeight.Bold),
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                modifier = if (confirmTag != null) Modifier.testTag(confirmTag) else Modifier,
            ) {
                Text(text = AccountRowsCopy.SIGN_IN, color = RoyColors.primary)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(AccountRowsCopy.CANCEL) }
        },
    )
}
