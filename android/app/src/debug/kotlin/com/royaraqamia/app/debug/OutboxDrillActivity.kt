package com.royaraqamia.app.debug

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import com.royaraqamia.app.AppGraph
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.session.SignInOutcome
import kotlinx.coroutines.launch

/**
 * The Outbox drill's device half (#650): a debug-only activity the
 * `npm run android:outbox-drill` script drives over adb.
 *
 * The case it exists for cannot be driven from a browser or a JVM test: a write
 * is made with no radio, the process is killed, the radio returns, and the app
 * that comes back has to deliver it. A screen cannot be told to do that, and an
 * instrumented test cannot outlive its own process. So the drill activity does
 * the three things a human would — sign in, write, and (after the kill) drain —
 * and prints one log line per step under [TAG], which the script reads back.
 *
 * It is declared in `src/debug/AndroidManifest.xml` only, so a release APK has
 * neither the activity nor a way to seed a write. Its strings are English for
 * the same reason the workbench's are: a developer reads them, not a member.
 */
class OutboxDrillActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mode = intent.getStringExtra(EXTRA_MODE).orEmpty()

        lifecycleScope.launch {
            val graph = AppGraph.create(
                context = this@OutboxDrillActivity,
                siteUrl = BuildConfig.SITE_URL,
                authUrl = BuildConfig.SUPABASE_AUTH_URL,
                anonKey = BuildConfig.SUPABASE_ANON_KEY,
            )
            when (mode) {
                MODE_SIGN_IN -> signIn(graph)
                MODE_SEED -> seed(graph)
                MODE_VERIFY -> verify(graph)
                else -> Log.i(TAG, "unknown mode: $mode")
            }
            finish()
        }
    }

    /** Online, before the radio is cut: the session every later step reads. */
    private suspend fun signIn(graph: AppGraph) {
        val email = intent.getStringExtra(EXTRA_EMAIL).orEmpty()
        val password = intent.getStringExtra(EXTRA_PASSWORD).orEmpty()
        when (val outcome = graph.signIn(email, password)) {
            is SignInOutcome.SignedIn -> Log.i(TAG, "signed-in true")
            SignInOutcome.Refused -> Log.i(TAG, "signed-in false refused")
            is SignInOutcome.Unreachable -> Log.i(TAG, "signed-in false unreachable ${outcome.detail}")
        }
    }

    /**
     * Offline: the write is committed to the database and its intent, and nothing
     * else. `start()` is deliberately not called — a refresh with no radio would
     * spend ten seconds timing out, and the point is that the write does not need
     * a session, only the identity the last sign-in remembered.
     */
    private suspend fun seed(graph: AppGraph) {
        val name = intent.getStringExtra(EXTRA_NAME) ?: "Drill habit"
        val row = graph.habitflow.addHabit(name)
        val status = graph.habitflow.outboxStatus()
        Log.i(TAG, "queued ${row.id} pending=${status.pending} identity=${graph.session.storeIdentity.key}")
    }

    /**
     * After the kill and the radio: the launch path the app itself runs — restore
     * the session, drain the queue, then pull to prove the row is on the server.
     *
     * The row is deleted afterwards, which is both the cleanup (the drill owns
     * the account's rows, so it may not leave one behind) and a second write
     * exercising the delete path on a real device.
     */
    private suspend fun verify(graph: AppGraph) {
        val expected = intent.getStringExtra(EXTRA_ID).orEmpty()
        val signedIn = graph.start()
        val report = graph.drainOutbox()
        Log.i(
            TAG,
            "drained signed-in=$signedIn pending=${report.pending} failed=${report.failed} " +
                "replayed=${report.replayed}",
        )

        graph.habitflow.pull()
        val present = graph.habitflow.rows().any { it.id == expected }
        Log.i(TAG, "verified $expected present=$present")

        if (present) {
            graph.habitflow.deleteHabit(expected)
            val cleaned = graph.habitflow.drain()
            Log.i(TAG, "cleaned $expected pending=${cleaned.pending} failed=${cleaned.failed}")
        }
    }

    private companion object {
        /** One tag for the script: every line it waits for starts with this. */
        const val TAG = "RoyOutbox"

        const val EXTRA_MODE = "roy.outbox.mode"
        const val EXTRA_EMAIL = "roy.outbox.email"
        const val EXTRA_PASSWORD = "roy.outbox.password"
        const val EXTRA_NAME = "roy.outbox.name"
        const val EXTRA_ID = "roy.outbox.id"

        const val MODE_SIGN_IN = "signin"
        const val MODE_SEED = "seed"
        const val MODE_VERIFY = "verify"
    }
}
