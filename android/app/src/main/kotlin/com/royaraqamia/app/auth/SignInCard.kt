package com.royaraqamia.app.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The app's sign-in card (#770), the pair of `app/auth/login/page.tsx`.
 *
 * The words are `SignInCopy` — generated from `shared/copy/sign-in.json`, the same
 * source the site's form reads — because a retyped Arabic label is a label that
 * fails an exact-text test later while looking right on a device (ADR-0098).
 *
 * The card is deliberately the whole of what this slice guarantees: an email, a
 * password, the one call, and the answer named. A provider button, password
 * reset and the site's own provider path arrive with the ticket that carries the
 * `royar://auth` return; leaving them out is stated here rather than implied by a
 * missing button.
 */
@Composable
fun SignInCard(
    state: SignInUiState,
    onSignIn: (email: String, password: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val busy = state is SignInUiState.Busy

    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = SignInCopy.TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )

        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            singleLine = true,
            enabled = !busy,
            label = { Text(SignInCopy.EMAIL) },
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            singleLine = true,
            enabled = !busy,
            label = { Text(SignInCopy.PASSWORD) },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.fillMaxWidth(),
        )

        Button(
            onClick = { onSignIn(email.trim(), password) },
            enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (busy) {
                Icon(imageVector = LucideVectors.LoaderCircle, contentDescription = null)
            }
            Text(if (busy) SignInCopy.BUSY else SignInCopy.SUBMIT)
        }

        when (state) {
            SignInUiState.Refused ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = LucideVectors.CircleAlert, contentDescription = null)
                    Text(
                        text = SignInCopy.REFUSED,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            SignInUiState.Unreachable ->
                Text(
                    text = SignInCopy.UNREACHABLE,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            SignInUiState.Idle, SignInUiState.Busy -> Unit
        }
    }
}
