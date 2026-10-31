package com.royaraqamia.app.shell

import android.content.Intent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The shell is behind the icon, on a device (#752).
 *
 * The stock instrumentation test asserted `com.getcapacitor.app`, which this
 * application has never had — the id is `com.royaraqamia.app` — so the only
 * instrumented test in the tree failed on any device.
 *
 * The class is asserted as *present among the launchers*, not as the one
 * `getLaunchIntentForPackage` returns: a debug APK also declares the workbench
 * (`src/debug/AndroidManifest.xml`), and the package manager may hand back either.
 * Which activity a release build starts is text, and
 * `scripts/__tests__/shell-launcher.test.mjs` already holds the release manifest
 * to it.
 */
@RunWith(AndroidJUnit4::class)
class ShellLauncherTest {
    @Test
    fun shellIsBehindTheIcon() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        assertEquals("com.royaraqamia.app", context.packageName)

        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        assertNotNull(launch)

        val intents =
            context.packageManager.queryIntentActivities(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_LAUNCHER)
                    .setPackage(context.packageName),
                0,
            )
        val launchers = intents.mapNotNull { it.activityInfo?.name }.toSet()
        assertTrue(
            "ShellActivity is not among the launchers: $launchers",
            launchers.contains(ShellActivity::class.java.name),
        )
    }
}
