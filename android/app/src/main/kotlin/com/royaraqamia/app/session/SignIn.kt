package com.royaraqamia.app.session

import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.IOException

/** What one attempt to sign in came to. */
sealed interface SignInOutcome {
    /** The server minted a pair, and the session now holds it. */
    data class SignedIn(val pair: TokenPair) : SignInOutcome

    /**
     * The credentials were not accepted: a wrong password, an unknown address, or
     * an account that cannot sign in with a password at all. The user can act on
     * all three the same way — try again or use another method — so they are one
     * answer rather than three.
     */
    data object Refused : SignInOutcome

    /** The question never got an answer: no radio, a timeout, a 5xx. */
    data class Unreachable(val detail: String) : SignInOutcome
}

/**
 * The password grant (#501), through the app's one HTTP client.
 *
 * This is the half of sign-in that needs no browser: an email and a password go to
 * GoTrue as they are, and the pair comes back. Google and the other providers are
 * the other half — a Custom Tab and the `royar://auth` return — and they are not
 * this class, because they never see a password.
 *
 * A 400 here is the ordinary "wrong email or password" answer rather than an error
 * worth logging; a 5xx is the one that may be worth retrying, so the two do not
 * share an outcome.
 */
class SupabasePasswordGrant(
    private val authUrl: String,
    private val apiKey: String,
    private val transport: Transport = HttpTransport,
) {
    suspend fun signIn(email: String, password: String): SignInOutcome =
        withContext(Dispatchers.IO) {
            val response =
                try {
                    transport.send(
                        method = "POST",
                        url = "${authUrl.trimEnd('/')}/token?grant_type=password",
                        headers = mapOf("apikey" to apiKey, "Content-Type" to "application/json"),
                        body =
                            ContractCodec.json.encodeToString(
                                GoTruePasswordRequest(email = email, password = password)
                            ),
                    )
                } catch (error: IOException) {
                    return@withContext SignInOutcome.Unreachable(error.message ?: "unreachable")
                }

            if (response.status == 400 || response.status == 401 || response.status == 403) {
                return@withContext SignInOutcome.Refused
            }
            if (response.status != 200) {
                return@withContext SignInOutcome.Unreachable("auth answered ${response.status}")
            }

            try {
                val session = ContractCodec.json.decodeFromString<GoTrueSession>(response.body)
                SignInOutcome.SignedIn(session.asPair())
            } catch (_: Exception) {
                SignInOutcome.Unreachable("auth answered a body this client cannot read")
            }
        }
}
