package com.royaraqamia.app.session

import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.IOException

/** What one attempt to spend a refresh token came to. */
sealed interface RefreshOutcome {
    /** The server minted a new pair. */
    data class Renewed(val pair: TokenPair) : RefreshOutcome

    /**
     * The server will not accept this token: expired, rotated already, revoked,
     * or an account that was signed out elsewhere. This is the answer that ends
     * the session.
     */
    data object Refused : RefreshOutcome

    /**
     * The question never got an answer — no radio, a timeout, a 5xx. The token
     * may well be fine, so the session keeps it: signing someone out because the
     * train went into a tunnel is the bug this case exists to prevent.
     */
    data class Unreachable(val detail: String) : RefreshOutcome
}

/** Exchanges a refresh token for a pair. One implementation ships; tests fake it. */
fun interface TokenRefresher {
    suspend fun refresh(refreshToken: String): RefreshOutcome
}

/**
 * The GoTrue refresh call (#501), through the app's one HTTP client.
 *
 * `authUrl` is the project's auth base (`https://<ref>.supabase.co/auth/v1`), and
 * `apiKey` is the anon key the platform requires on every auth call — public by
 * design, which is why it is a build-config value rather than a secret.
 *
 * A 400/401 here is [RefreshOutcome.Refused]: GoTrue answers a spent or revoked
 * refresh token that way, and the body's reason is not something a screen can
 * act on beyond asking the user to sign in again. Everything else — a 5xx, a
 * timeout, a body that does not decode — is [RefreshOutcome.Unreachable], because
 * none of those say the token is bad.
 */
class SupabaseTokenRefresher(
    private val authUrl: String,
    private val apiKey: String,
    private val transport: Transport = HttpTransport,
) : TokenRefresher {
    override suspend fun refresh(refreshToken: String): RefreshOutcome = withContext(Dispatchers.IO) {
        val response = try {
            transport.send(
                method = "POST",
                url = "${authUrl.trimEnd('/')}/token?grant_type=refresh_token",
                headers = mapOf("apikey" to apiKey, "Content-Type" to "application/json"),
                body = ContractCodec.json.encodeToString(GoTrueRefreshRequest(refreshToken)),
            )
        } catch (error: IOException) {
            return@withContext RefreshOutcome.Unreachable(error.message ?: "unreachable")
        }

        if (response.status == 400 || response.status == 401 || response.status == 403) {
            return@withContext RefreshOutcome.Refused
        }
        if (response.status != 200) {
            return@withContext RefreshOutcome.Unreachable("auth answered ${response.status}")
        }

        try {
            val parsed = ContractCodec.json.decodeFromString<GoTrueSession>(response.body)
            RefreshOutcome.Renewed(parsed.asPair())
        } catch (_: Exception) {
            RefreshOutcome.Unreachable("auth answered a body this client cannot read")
        }
    }
}
