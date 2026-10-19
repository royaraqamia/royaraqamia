package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.json.JSONException;
import org.junit.Test;

/**
 * The shell's own origin, on the JVM: two native features build URLs from it
 * (the update check, ADR-0043, and the background drain, ADR-0059) and both
 * inherit whatever this arithmetic gets wrong — including, on a dev drill, which
 * server the app is pointed at. `org.json` comes from the JVM dependency in
 * `app/build.gradle` so the real parser is exercised rather than android.jar's
 * stub.
 */
public class ShellServerTest {

    @Test
    public void originKeepsTheSchemeHostAndPortAndDropsEverythingElse() {
        assertEquals("https://royaraqamia.com", ShellServer.originOf("https://royaraqamia.com"));
        assertEquals(
            "https://royaraqamia.com",
            ShellServer.originOf("https://royaraqamia.com/some/deep/link?x=1#fragment")
        );
        // The dev drill points the shell at the host machine (10.0.2.2 from an
        // emulator), and the drain page has to come from where the site is.
        assertEquals("http://10.0.2.2:3000", ShellServer.originOf("http://10.0.2.2:3000"));
    }

    @Test
    public void originRefusesWhatItCannotParse() {
        assertNull(ShellServer.originOf(null));
        assertNull(ShellServer.originOf(""));
        assertNull(ShellServer.originOf("/sync-flush.html"));
    }

    @Test
    public void pageUrlJoinsTheOriginAndThePath() {
        assertEquals(
            "https://royaraqamia.com/sync-flush.html",
            ShellServer.pageUrl("https://royaraqamia.com", ShellServer.FLUSH_PATH)
        );
        assertEquals(
            "http://10.0.2.2:3000/sync-flush.html",
            ShellServer.pageUrl("http://10.0.2.2:3000/#/whatever", ShellServer.FLUSH_PATH)
        );
        assertNull(ShellServer.pageUrl("not a url", ShellServer.FLUSH_PATH));
    }

    @Test
    public void originComesFromThePackagedConfig() throws JSONException {
        assertEquals(
            "https://royaraqamia.com",
            ShellServer.originFrom(
                "{\"appId\":\"com.royaraqamia.app\",\"server\":{\"url\":\"https://royaraqamia.com\","
                    + "\"cleartext\":false}}"
            )
        );
        // A byte-order mark is what an editor on Windows leaves behind, and
        // failing on it would take the drain down silently on that build alone.
        assertEquals(
            "https://royaraqamia.com",
            ShellServer.originFrom("\uFEFF{\"server\":{\"url\":\"https://royaraqamia.com\"}}")
        );
    }

    @Test
    public void aConfigWithoutAServerUrlHasNoOrigin() throws JSONException {
        assertNull(ShellServer.originFrom("{\"appId\":\"com.royaraqamia.app\"}"));
        assertNull(ShellServer.originFrom("{\"server\":{\"url\":\"\"}}"));
    }
}
