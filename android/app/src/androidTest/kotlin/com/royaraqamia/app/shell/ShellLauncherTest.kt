package com.royaraqamia.app.shell

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The launcher the platform starts, on a device (#752).
 *
 * The stock instrumentation test asserted `com.getcapacitor.app`, which this
 * application has never had — the id is `com.royaraqamia.app` — so the only
 * instrumented test in the tree failed on any device. This one asks the package
 * manager the question the shell's launch actually depends on: this id, and
 * [ShellActivity] behind the icon.
 */
@RunWith(AndroidJUnit4::class)
class ShellLauncherTest {
    @Test
    fun launchIntentIsTheShell() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext

        assertEquals("com.royaraqamia.app", context.packageName)

        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
        assertNotNull(launch)
        assertEquals(ShellActivity::class.java.name, launch?.component?.className)
    }
}
