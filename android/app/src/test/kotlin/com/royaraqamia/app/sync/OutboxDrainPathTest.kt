package com.royaraqamia.app.sync

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The delivery path has no WebView in it (#651).
 *
 * The shell used to deliver a queued write by loading `/sync-flush.html` in a
 * headless WebView, and the page that does the draining still exists — for
 * shells installed before this slice. What must not come back is the app using
 * it: a background WebView costs a renderer process, cannot run on a device
 * whose System WebView is being updated, and gives the queue a second writer.
 *
 * So this is a text check rather than a behaviour one, the same shape
 * `ShellSyncWakeTest` uses for the manifest: the claim is about what the source
 * contains, and a reviewer should see the file that breaks it.
 */
class OutboxDrainPathTest {

    private val sources: List<File> = syncSources()

    @Test
    fun theDrainPackageUsesNoWebView() {
        assertTrue("no drain sources found: the test's file layout changed", sources.isNotEmpty())

        for (source in sources) {
            val text = source.readText()
            // The import is the claim: a WebView cannot be built without it, and a
            // comment that *names* one (the worker's does, explaining what it is
            // not) is not one.
            assertFalse(
                "${source.name} reaches for a WebView: the drain is native (#651)",
                text.contains("android.webkit"),
            )
        }
    }

    @Test
    fun theShellsWebViewWorkerIsGone() {
        val java = File("src/main/java/com/royaraqamia/app")
        val leftovers =
            java.listFiles().orEmpty().map { it.name }.filter {
                it == "SyncFlushWorker.java" || it == "SyncFlushResult.java"
            }

        assertTrue("the WebView drain came back: $leftovers", leftovers.isEmpty())
    }

    /** Wherever this module's sources are, the sync package is under one of them. */
    private fun syncSources(): List<File> {
        val candidates =
            listOf(
                File("src/main/kotlin/com/royaraqamia/app/sync"),
                File("app/src/main/kotlin/com/royaraqamia/app/sync"),
                File("android/app/src/main/kotlin/com/royaraqamia/app/sync"),
            )

        return candidates.firstOrNull { it.isDirectory }?.listFiles { file -> file.extension == "kt" }
            .orEmpty()
            .toList()
    }
}
