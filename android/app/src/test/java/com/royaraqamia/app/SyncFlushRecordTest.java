package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

/**
 * The persistence surface `/device` reads through (#455), on the JVM.
 *
 * The page parses whatever `lastFlush()` hands it, and nothing at runtime links
 * the two: a renamed field would leave the section silently out, and an entered
 * count that is not a sum would claim work the shell did not do. So these pins
 * hold the shape the page parses and the two sums — `replayed` delivers,
 * `applied` pulls — against the drain page's own report format, with no device,
 * a WebView or a network.
 */
public class SyncFlushRecordTest {

    private static final long AT = 1_760_000_000_000L;

    @Test
    public void theReportSumsIntoTheSmallRecord() throws Exception {
        SyncFlushRecord record = SyncFlushRecord.fromReport(AT,
            "{\"outcomes\":[{\"product\":\"habitflow\",\"replayed\":2,\"pending\":0},"
                + "{\"product\":\"blogpress\",\"replayed\":1,\"pending\":3}],"
                + "\"refreshed\":[{\"product\":\"habitflow\",\"applied\":4}],"
                + "\"pending\":3,\"failed\":0,\"error\":null}");

        assertEquals(AT, record.at);
        assertEquals(3, record.delivered);
        assertEquals(3, record.left);
        assertEquals(4, record.pulled);
        assertNull(record.error);
    }

    @Test
    public void aFailedDrainNamesItsError() throws Exception {
        SyncFlushRecord record = SyncFlushRecord.fromReport(AT,
            "{\"outcomes\":[],\"refreshed\":[],\"pending\":0,\"failed\":0,"
                + "\"error\":\"session lookup failed (503)\"}");

        assertEquals(0, record.delivered);
        assertEquals(0, record.left);
        assertEquals(0, record.pulled);
        assertEquals("session lookup failed (503)", record.error);
    }

    @Test
    public void anythingUnreadableIsNoRecord() {
        // Not the page's report at all — the same test `SyncFlushResult.parse`
        // makes, because history invented from a landing page would be a lie.
        assertNull(SyncFlushRecord.fromReport(AT, null));
        assertNull(SyncFlushRecord.fromReport(AT, "not json"));
        assertNull(SyncFlushRecord.fromReport(AT, "{\"ok\":true}"));
        assertNull(SyncFlushRecord.fromReport(AT,
            "{\"outcomes\":[],\"refreshed\":[],\"failed\":0,\"error\":null}"));
    }

    @Test
    public void theRecordIsTheExactShapeThePageParses() throws Exception {
        String json = SyncFlushRecord.fromReport(AT,
            "{\"outcomes\":[{\"replayed\":1}],\"refreshed\":[{\"applied\":2}],"
                + "\"pending\":1,\"failed\":0,\"error\":null}")
            .toJson();

        JSONObject shape = new JSONObject(json);
        assertEquals(AT, shape.getLong("at"));
        assertEquals(1, shape.getInt("delivered"));
        assertEquals(1, shape.getInt("left"));
        assertEquals(2, shape.getInt("pulled"));
        assertTrue("an absent error reads as null, never an empty string", shape.isNull("error"));
        // Keep it small: nothing the page does not name belongs in the record.
        assertEquals(5, shape.length());
    }

    @Test
    public void anErrorSurvivesTheRoundTrip() throws Exception {
        String json = SyncFlushRecord.fromReport(AT,
            "{\"outcomes\":[],\"refreshed\":[],\"pending\":0,\"failed\":0,"
                + "\"error\":\"the drain failed: no session\"}")
            .toJson();

        JSONObject shape = new JSONObject(json);
        assertEquals("the drain failed: no session", shape.getString("error"));
    }
}
