package com.royaraqamia.app.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.royaraqamia.app.AppGraph
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.connectedapps.ConnectedAppsCard
import com.royaraqamia.app.connectedapps.ConnectedAppsCopy
import com.royaraqamia.app.connectedapps.ConnectedAppsUiState
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.plans.PlanCard
import com.royaraqamia.app.plans.UsageUiState
import com.royaraqamia.app.session.SignInOutcome
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import kotlinx.coroutines.launch

/**
 * A debug-only workbench (#647, #501): the first Compose screen that signs in and
 * reads an authorized route from the real server.
 *
 * It is a harness, not a product surface, and it is deliberately not in the
 * release APK: the activity is declared in `src/debug/AndroidManifest.xml` only,
 * and the project URL and publishable key come from this machine's
 * `android/local.properties` through debug-only `BuildConfig` fields. A shipped
 * build therefore cannot reach this screen, cannot carry the values, and does not
 * change at all.
 *
 * That is also why the strings are English here. The card's own copy is the site's,
 * byte for byte ([com.royaraqamia.app.plans.UsageCopy]); what a developer reads
 * around it is not user-facing text and is not translated.
 *
 * It exists to answer one question on a device — "does the app's own UI get data
 * from an owned route?" — before a product screen is built on top of it. When the
 * account surface lands as a `*Screen.kt` with its row in `docs/mobile/screens.json`,
 * this file is what gets deleted.
 */
class WorkbenchActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent { Workbench() }
    }
}

@Composable
private fun Workbench() {
    RoyaraqamiaTheme {
        // The app is RTL before it is anything else (ADR-0089): the site is Arabic
        // and a screen laid out left-to-right is the wrong screen.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                Column(
                    modifier =
                        Modifier.safeDrawingPadding()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "workbench · ${com.royaraqamia.app.plans.UsageRepository.PATH}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
                        Unconfigured()
                    } else {
                        Connected()
                    }
                }
            }
        }
    }
}

@Composable
private fun Unconfigured() {
    Text(
        text =
            "This build has no project: add supabase.url and supabase.anonKey to " +
                "android/local.properties and rebuild.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun Connected() {
    val context = LocalContext.current
    val graph = remember {
        AppGraph.create(
            context = context.applicationContext,
            siteUrl = SITE_URL,
            authUrl = BuildConfig.SUPABASE_URL.trimEnd('/') + AUTH_SUFFIX,
            anonKey = BuildConfig.SUPABASE_ANON_KEY,
        )
    }
    val scope = rememberCoroutineScope()

    var usage by remember { mutableStateOf<UsageUiState>(UsageUiState.Loading) }
    var apps by remember { mutableStateOf<ConnectedAppsUiState>(ConnectedAppsUiState.Loading) }
    var appsError by remember { mutableStateOf<String?>(null) }
    var signedIn by remember { mutableStateOf(false) }
    var signInError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(true) }

    suspend fun read() {
        usage = UsageUiState.Loading
        usage = UsageUiState.from(graph.usage.load())
    }

    suspend fun readApps() {
        apps = ConnectedAppsUiState.Loading
        apps = ConnectedAppsUiState.from(graph.connectedApps.list())
    }

    /** A revoke is a request: the list is re-read from the server either way. */
    fun disconnect(clientId: String) {
        scope.launch {
            appsError = null
            if (graph.connectedApps.disconnect(clientId) is ApiResult.Failure) {
                appsError = ConnectedAppsCopy.DISCONNECT_FAILED
            }
            readApps()
        }
    }

    LaunchedEffect(graph) {
        // The same call the first native screen will make at launch: a stored
        // refresh token is a session that survived the process.
        signedIn = graph.start()
        busy = false
        if (signedIn) {
            read()
            readApps()
        }
    }

    if (signedIn) {
        PlanCard(
            state = usage,
            onRetry = { scope.launch { read() } },
            onSignIn = { signedIn = false },
        )
        ConnectedAppsCard(
            state = apps,
            actionError = appsError,
            onRetry = { scope.launch { readApps() } },
            onSignIn = { signedIn = false },
            onDisconnect = { app -> disconnect(app.clientId) },
            onDisconnectAll = {
                scope.launch {
                    appsError = null
                    if (graph.connectedApps.disconnectAll() is ApiResult.Failure) {
                        appsError = ConnectedAppsCopy.DISCONNECT_FAILED
                    }
                    readApps()
                }
            },
            onConnectNew = {},
        )
    } else {
        SignInForm(
            busy = busy,
            error = signInError,
            onSubmit = { email, password ->
                scope.launch {
                    busy = true
                    signInError = null
                    when (val outcome = graph.signIn(email, password)) {
                        is SignInOutcome.SignedIn -> {
                            signedIn = true
                            read()
                            readApps()
                        }
                        SignInOutcome.Refused -> signInError = "Wrong email or password."
                        is SignInOutcome.Unreachable -> signInError = outcome.detail
                    }
                    busy = false
                }
            },
        )
    }
}

@Composable
private fun SignInForm(busy: Boolean, error: String?, onSubmit: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    OutlinedTextField(
        value = email,
        onValueChange = { email = it },
        label = { Text("email") },
        singleLine = true,
        enabled = !busy,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier.fillMaxWidth(),
        textStyle = LocalRoyTypeScale.current.let { it.field(it.body) },
    )
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text("password") },
        singleLine = true,
        enabled = !busy,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        modifier = Modifier.fillMaxWidth(),
        textStyle = LocalRoyTypeScale.current.let { it.field(it.body) },
    )
    if (error != null) {
        Text(
            text = error,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    Button(
        onClick = { onSubmit(email.trim(), password) },
        enabled = !busy && email.isNotBlank() && password.isNotBlank(),
    ) {
        Text(if (busy) "Signing in…" else "Sign in")
    }
}

/** The site the owned routes live on. */
private const val SITE_URL = "https://royaraqamia.com"

/** GoTrue's mount point under the project URL. */
private const val AUTH_SUFFIX = "/auth/v1"
