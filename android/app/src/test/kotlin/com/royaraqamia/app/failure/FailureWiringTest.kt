package com.royaraqamia.app.failure

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The wiring a unit test cannot otherwise reach (#667): the process's entry
 * point exists and installs the handler, and the drill that throws on purpose
 * exists only in a debug build.
 *
 * Read as source text, because the alternative is a device: `RoyApplication` is
 * the platform's own hook, and whether it is named in the manifest is exactly
 * what a release APK's behaviour depends on.
 */
class FailureWiringTest {
    private val root: File =
        listOf(File("."), File("app"), File("android/app")).firstOrNull { candidate ->
            File(candidate, "src/main/AndroidManifest.xml").isFile
        } ?: File(".")

    private fun source(path: String) = File(root, path).readText()

    @Test
    fun `the application class is named in the manifest`() {
        assertTrue(
            "the release manifest must name the Application that installs the crash handler",
            source("src/main/AndroidManifest.xml").contains("android:name=\".RoyApplication\""),
        )
    }

    @Test
    fun `the application installs the handler before anything else it arms`() {
        val application = source("src/main/kotlin/com/royaraqamia/app/RoyApplication.kt")

        assertTrue(application.contains("FailureReporter.install(this)"))
        // The exit history and the work are off the launch path, which is why
        // they are in a thread rather than called inline.
        assertTrue(application.contains("Thread(::armFailures"))
    }

    @Test
    fun `the crash drill is a debug source set only`() {
        assertTrue(
            File(root, "src/debug/kotlin/com/royaraqamia/app/debug/CrashDrillActivity.kt").isFile,
        )
        assertFalse(
            File(root, "src/main/kotlin/com/royaraqamia/app/debug/CrashDrillActivity.kt").exists(),
        )
        assertFalse(source("src/main/AndroidManifest.xml").contains("CrashDrill"))
        assertTrue(source("src/debug/AndroidManifest.xml").contains(".debug.CrashDrillActivity"))
    }

    @Test
    fun `a release build keeps the line numbers a mapping needs`() {
        val rules = File(root, "proguard-rules.pro").readText()

        assertTrue(rules.contains("-keepattributes SourceFile,LineNumberTable"))
        assertFalse(rules.contains("#-keepattributes"))
    }
}
