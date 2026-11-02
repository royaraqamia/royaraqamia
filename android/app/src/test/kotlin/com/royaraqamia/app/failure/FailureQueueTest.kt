package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.generated.AppFailureReport
import com.royaraqamia.app.contracts.generated.AppFailureReportKind
import com.royaraqamia.app.contracts.generated.AppFailureReportReason
import com.royaraqamia.app.contracts.generated.AppFailureReportShell
import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The queue's three bounds (#667): what it holds, for how long, and that it
 * never throws — a queue that threw would be the crash the app dies of.
 */
class FailureQueueTest {
    private val directory: File = Files.createTempDirectory("roy-failures").toFile()
    private var clock = 1_700_000_000_000L

    @After
    fun tearDown() {
        directory.deleteRecursively()
    }

    private fun report(kind: AppFailureReportKind = AppFailureReportKind.CRASH): AppFailureReport =
        AppFailureReport(
            version = 1.0,
            kind = kind,
            reason = AppFailureReportReason.UNCAUGHT,
            signature = "java.lang.IllegalStateException",
            shell = AppFailureReportShell("1.0.21", 20_021),
            contracts = "05eb4c086b1b",
            at = clock,
        )

    private fun queue(limit: Int = 20) = FailureQueue(directory, limit = limit, now = { clock })

    @Test
    fun `a report is on disk before the caller returns`() {
        val queued = queue().add(report())

        assertTrue(queued)
        val pending = queue().pending()
        assertEquals(1, pending.size)
        assertTrue(pending[0].body.contains("\"contracts\":\"05eb4c086b1b\""))
        assertTrue(pending[0].body.contains("\"version\":1"))
    }

    @Test
    fun `the queue is read oldest first`() {
        val store = queue()
        store.add(report())
        clock += 1_000
        store.add(report())
        clock += 1_000
        store.add(report())

        val names = store.pending().map { it.file.name }
        assertEquals(names.sorted(), names)
        assertTrue(names[0] < names[2])
    }

    @Test
    fun `only the newest reports survive the cap`() {
        val store = queue(limit = 3)
        repeat(5) {
            store.add(report())
            clock += 1_000
        }

        val pending = store.pending()
        assertEquals(3, pending.size)
        val bodies = pending.map { it.body }
        assertTrue(bodies.none { it.contains("\"at\":${1_700_000_000_000}") })
    }

    @Test
    fun `a report older than the age bound is dropped`() {
        val store = queue()
        store.add(report())
        clock += FailureQueue.MAX_AGE_MS + 1

        assertEquals(0, store.pending().size)
        assertEquals(0, directory.listFiles().orEmpty().size)
    }

    @Test
    fun `a file that is not a report is left alone and an unreadable one is dropped`() {
        directory.mkdirs()
        val foreign = File(directory, "notes.txt").also { it.writeText("keep me") }
        val broken = File(directory, "${clock}-crash${FailureQueue.SUFFIX}").also { it.writeText("") }

        val pending = queue().pending()

        assertEquals(0, pending.size)
        assertTrue(foreign.exists())
        assertFalse(broken.exists())
    }

    @Test
    fun `a half-written report is never read as a body`() {
        directory.mkdirs()
        File(directory, "${clock}-crash${FailureQueue.SUFFIX}.part").writeText("{\"version\":")

        assertEquals(0, queue().pending().size)
    }

    @Test
    fun `a directory that cannot be written answers false instead of throwing`() {
        val missing = File(File(directory, "not-a-directory"), "queue")
        missing.parentFile.writeText("a file where the queue wants a directory")

        val queued = FailureQueue(missing, now = { clock }).add(report())

        assertFalse(queued)
    }
}
