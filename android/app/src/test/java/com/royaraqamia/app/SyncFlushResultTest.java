package com.royaraqamia.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The drain worker's only decision (ADR-0059), on the JVM.
 *
 * The asymmetry is the point of these tests: "come back later" is the safe answer
 * to every unreadable input, because the alternative — treating a report that
 * never arrived as "nothing to drain" — retires work the user is waiting on, and
 * nothing would notice.
 */
public class SyncFlushResultTest {

    @Test
    public void aCleanReportIsDone() {
        SyncFlushResult result = SyncFlushResult.parse(
            "{\"outcomes\":[],\"pending\":0,\"failed\":0,\"error\":null}"
        );

        assertFalse(result.retry);
        assertTrue(result.summary, result.summary.contains("failed=0"));
    }

    @Test
    public void pendingWorkComesBack() {
        SyncFlushResult result = SyncFlushResult.parse(
            "{\"outcomes\":[{\"product\":\"habitflow\",\"pending\":2}],\"pending\":2,\"failed\":0,\"error\":null}"
        );

        assertTrue(result.retry);
        assertTrue(result.summary, result.summary.contains("2"));
    }

    @Test
    public void aDrainThatCouldNotRunComesBack() {
        SyncFlushResult result = SyncFlushResult.parse(
            "{\"outcomes\":[],\"pending\":0,\"failed\":0,"
                + "\"error\":\"session lookup failed (503)\"}"
        );

        assertTrue(result.retry);
        assertTrue(result.summary, result.summary.contains("session lookup failed"));
    }

    @Test
    public void aPermanentRefusalIsNotRetriedButIsReported() {
        // The server refused an intent for good: it stays in the Outbox for the
        // user to see and retry, and a background worker cannot improve on that.
        SyncFlushResult result = SyncFlushResult.parse(
            "{\"outcomes\":[],\"pending\":0,\"failed\":1,\"error\":null}"
        );

        assertFalse(result.retry);
        assertTrue(result.summary, result.summary.contains("failed=1"));
    }

    @Test
    public void anythingUnreadableComesBack() {
        assertTrue(SyncFlushResult.parse(null).retry);
        assertTrue(SyncFlushResult.parse("").retry);
        assertTrue(SyncFlushResult.parse("   ").retry);
        assertTrue(SyncFlushResult.parse("not json").retry);
        // Landing on the offline document instead of the drain page must not read
        // as "nothing to do".
        assertTrue(SyncFlushResult.parse("<!doctype html><html></html>").retry);
    }

    @Test
    public void aReportWithoutAPendingCountIsNotADrainReport() {
        assertTrue(SyncFlushResult.parse("{\"ok\":true}").retry);
    }
}
