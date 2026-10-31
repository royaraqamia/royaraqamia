package com.royaraqamia.app.baselineprofile

import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * The one path a cold launch takes (#762).
 *
 * The profile's job is to name the classes and methods the shell touches on its
 * way to the first frame, so the background dexopt compiles them before a user
 * ever opens the app. `pressHome` puts the task out of the way first, so each
 * iteration is a launch rather than a bring-to-front.
 *
 * The hand-over to the document is left out deliberately: it is a second activity
 * behind the frame, and a profile that named it would spend compilation on a
 * surface #662 deletes.
 */
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule val baselineProfileRule = BaselineProfileRule()

    @Test
    fun shellStartup() =
        baselineProfileRule.collect(packageName = "com.royaraqamia.app") {
            pressHome()
            startActivityAndWait()
        }
}
