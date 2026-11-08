package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.AppFailureReportKind
import com.royaraqamia.app.contracts.generated.AppFailureReportReason
import com.royaraqamia.app.contracts.generated.ContractGeneration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What may and may not travel inside a report (#667).
 *
 * These are the acceptance criteria as tests: the release is named, the contract
 * generation is named, a frame is a machine-shaped string or it is dropped, and
 * nothing a throwable was constructed with — its message above all — can reach
 * the body.
 */
class FailureReportFactoryTest {
    private val shell = ShellIdentity(name = "1.0.21", code = 20_021)

    private fun errorOf(vararg frames: StackTraceElement, message: String = "boom"): Throwable =
        IllegalStateException(message).also { it.stackTrace = arrayOf(*frames) }

    private fun frame(className: String, method: String, file: String?, line: Int) =
        StackTraceElement(className, method, file, line)

    @Test
    fun `a crash names the release and the contract generation`() {
        val report = FailureReportFactory.crash(errorOf(frame("com.royaraqamia.app.Shell", "onCreate", "Shell.kt", 9)), shell)

        assertEquals(AppFailureReportKind.CRASH, report.kind)
        assertEquals(AppFailureReportReason.UNCAUGHT, report.reason)
        assertEquals("1.0.21", report.shell.name)
        assertEquals(20_021L, report.shell.code)
        assertEquals(ContractGeneration.STAMP, report.contracts)
        assertEquals("java.lang.IllegalStateException", report.signature)
        assertEquals(listOf("com.royaraqamia.app.Shell.onCreate(Shell.kt:9)"), report.frames)
    }

    @Test
    fun `a frame is class method file and line, and nothing else`() {
        val frames =
            FailureReportFactory.framesOf(
                errorOf(
                    frame("com.royaraqamia.app.Shell", "onCreate", "Shell.kt", 9),
                    // No file name: a placeholder would be a sentence in a
                    // field the contract keeps machine-shaped.
                    frame("com.royaraqamia.app.Shell", "onResume", null, 12),
                    // No line number: nothing to retrace.
                    frame("com.royaraqamia.app.Shell", "onPause", "Shell.kt", -1),
                    // Longer than the contract allows.
                    frame("com.royaraqamia.app." + "x".repeat(200), "run", "Long.kt", 1),
                    // A credential's name, whatever it arrived as.
                    frame("com.royaraqamia.app.Session", "refresh", "refresh_token.kt", 4),
                )
            )

        assertEquals(listOf("com.royaraqamia.app.Shell.onCreate(Shell.kt:9)"), frames)
    }

    @Test
    fun `a frame carrying a query string is dropped`() {
        val frames = FailureReportFactory.framesOf(errorOf(frame("com.x.Y?token=abc", "run", "Y.kt", 1)))

        assertTrue(frames.isEmpty())
    }

    @Test
    fun `the stack is capped at the contract's own limit`() {
        val many =
            Array(FailureReportFactory.MAX_FRAMES + 8) { index ->
                frame("com.royaraqamia.app.F$index", "run", "F.kt", index)
            }
        val frames = FailureReportFactory.framesOf(errorOf(*many))

        assertEquals(FailureReportFactory.MAX_FRAMES, frames.size)
    }

    @Test
    fun `the exception's message never reaches the body`() {
        val report =
            FailureReportFactory.crash(
                errorOf(frame("com.x.Y", "run", "Y.kt", 1), message = "card 4111 refused at /p?token=abc"),
                shell,
                at = 1_700_000_000_000,
            )

        val body = ContractCodec.encode(report)
        assertFalse(body.contains("4111"))
        assertFalse(body.contains("token=abc"))
        assertTrue(body.contains("java.lang.IllegalStateException"))
    }

    @Test
    fun `a crash with no usable frame carries none`() {
        val report = FailureReportFactory.crash(errorOf(), shell)

        assertNull(report.frames)
    }

    @Test
    fun `an ANR carries no frames and no counts`() {
        val report = FailureReportFactory.anr(shell, at = 1_700_000_000_000)

        assertEquals(AppFailureReportKind.ANR, report.kind)
        assertEquals(AppFailureReportReason.ANR, report.reason)
        assertNull(report.frames)
        assertNull(report.pending)
        assertNull(report.failed)
    }

    @Test
    fun `a native death is a crash by class, not a Java frame list`() {
        val report = FailureReportFactory.nativeCrash(shell, at = 1_700_000_000_000)

        assertEquals(AppFailureReportKind.CRASH, report.kind)
        assertEquals(AppFailureReportReason.NATIVE, report.reason)
        assertNull(report.frames)
    }

    @Test
    fun `a failed drain carries two counts, no frames and no row`() {
        val report =
            FailureReportFactory.drain(
                reason = DrainFailureReason.REFUSED,
                pending = 1,
                failed = 3,
                shell = shell,
            )

        assertEquals(AppFailureReportKind.DRAIN, report.kind)
        assertEquals(AppFailureReportReason.REFUSED, report.reason)
        assertEquals(1L, report.pending)
        assertEquals(3L, report.failed)
        assertNull(report.frames)

        val body = ContractCodec.encode(report)
        assertTrue(body.contains("\"reason\":\"refused\""))
        assertTrue(body.contains(ContractGeneration.STAMP))
        assertFalse(body.contains("\"frames\""))
    }
}
