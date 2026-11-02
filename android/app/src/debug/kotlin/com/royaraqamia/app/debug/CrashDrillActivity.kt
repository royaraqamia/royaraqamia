package com.royaraqamia.app.debug

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity

/**
 * The deliberate crash (#667), for `npm run android:crash-drill`.
 *
 * Nothing here is part of the app's behaviour: the activity exists so the
 * reporter can be watched from the outside on a real device — the process dies
 * with the app's handler installed, the report lands in the queue with the
 * release's own version name, version code and contract generation, and the
 * delivery worker sends it once the radio allows. A debug build is the only
 * place a crash may be asked for on purpose, and this source set is not merged
 * into a release APK.
 *
 * The throw is delayed past the first frame on purpose: a crash during
 * `onCreate` is the launch path's failure, and the criterion is a crash from a
 * running app.
 */
class CrashDrillActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mode = intent?.getStringExtra(EXTRA_MODE)
        Log.i(TAG, "crash drill: mode=$mode")

        if (mode != MODE_CRASH) {
            finish()
            return
        }

        Handler(Looper.getMainLooper())
            .postDelayed({ throw IllegalStateException("the crash drill (#667)") }, DELAY_MS)
    }

    companion object {
        /** What `adb logcat -s` reads the drill under, and the script waits for. */
        const val TAG = "RoyCrashDrill"

        const val EXTRA_MODE = "roy.crash.mode"
        const val MODE_CRASH = "crash"

        /** Long enough that the activity is drawn and the process is a running app. */
        const val DELAY_MS = 1200L
    }
}
