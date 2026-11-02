package com.royaraqamia.app.failure

import android.app.ApplicationExitInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * What the platform's exit history adds, and what it must not repeat (#667).
 *
 * A Java crash is the handler's report; mapping `REASON_CRASH` here would file
 * every one of them twice, which is why that case is a test rather than a
 * comment.
 */
class ExitHistoryTest {
    @Test
    fun `an ANR and a native death are the classes the handler cannot see`() {
        assertEquals(ExitReason.ANR, ExitHistory.reasonOf(ApplicationExitInfo.REASON_ANR))
        assertEquals(
            ExitReason.NATIVE_CRASH,
            ExitHistory.reasonOf(ApplicationExitInfo.REASON_CRASH_NATIVE),
        )
    }

    @Test
    fun `a Java crash is left to the handler that wrote it`() {
        assertNull(ExitHistory.reasonOf(ApplicationExitInfo.REASON_CRASH))
    }

    @Test
    fun `a force-stop, a low-memory kill and a normal exit are not failures`() {
        for (code in
            listOf(
                ApplicationExitInfo.REASON_USER_REQUESTED,
                ApplicationExitInfo.REASON_LOW_MEMORY,
                ApplicationExitInfo.REASON_EXIT_SELF,
            )) {
            assertNull(ExitHistory.reasonOf(code))
        }
    }

    @Test
    fun `only deaths after the watermark are fresh, oldest first`() {
        val exits =
            listOf(
                ProcessExit(300, ExitReason.ANR),
                ProcessExit(100, ExitReason.NATIVE_CRASH),
                ProcessExit(200, ExitReason.ANR),
            )

        assertEquals(
            listOf(ProcessExit(200, ExitReason.ANR), ProcessExit(300, ExitReason.ANR)),
            ExitHistory.fresh(exits, watermark = 150),
        )
    }

    @Test
    fun `the watermark only moves forward`() {
        assertEquals(300L, ExitHistory.watermarkAfter(listOf(ProcessExit(300, ExitReason.ANR)), 100))
        assertEquals(500L, ExitHistory.watermarkAfter(listOf(ProcessExit(300, ExitReason.ANR)), 500))
        assertEquals(500L, ExitHistory.watermarkAfter(emptyList(), 500))
    }
}
