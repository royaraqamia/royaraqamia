package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shell's remote configuration (#661), on the JVM.
 *
 * The document is the only thing an operator edits to send a surface to the
 * browser, so what it may say and what a broken one means are decisions worth
 * pinning without a device: every failure has to answer the app as shipped (no
 * surface switched), because a bad deploy must not be able to take a screen away.
 */
class ShellConfigTest {
    @Test
    fun `the config lives beside the manifest on the configured origin`() {
        assertEquals(
            "https://royaraqamia.com/android/config.json",
            ShellConfig.configUrl("https://royaraqamia.com"),
        )
        assertEquals(
            "https://royaraqamia.com/android/config.json",
            ShellConfig.configUrl("https://royaraqamia.com/some/deep/link?x=1#fragment"),
        )
        assertEquals(
            "http://10.0.2.2:3000/android/config.json",
            ShellConfig.configUrl("http://10.0.2.2:3000"),
        )
    }

    @Test
    fun `an origin that is not a URL names no config`() {
        assertEquals(null, ShellConfig.configUrl(null))
        assertEquals(null, ShellConfig.configUrl(""))
        assertEquals(null, ShellConfig.configUrl("/android/config.json"))
    }

    @Test
    fun `an empty switch is the app as shipped`() {
        assertTrue(ShellConfig.browserSurfaces("{}").isEmpty())
        assertTrue(ShellConfig.browserSurfaces("""{"browserSurfaces": []}""").isEmpty())
    }

    @Test
    fun `a broken document is the app as shipped`() {
        assertTrue(ShellConfig.browserSurfaces("").isEmpty())
        assertTrue(ShellConfig.browserSurfaces("{not json").isEmpty())
        assertTrue(ShellConfig.browserSurfaces("""{"browserSurfaces": "rates"}""").isEmpty())
    }

    @Test
    fun `blank names cannot switch a surface`() {
        assertTrue(
            ShellConfig.browserSurfaces("""{"browserSurfaces": ["", "   "]}""").isEmpty()
        )
    }

    @Test
    fun `the document names surfaces and routes`() {
        assertEquals(
            setOf("community", "/rates"),
            ShellConfig.browserSurfaces(
                """{"browserSurfaces": [" community ", "/rates", "community"]}"""
            ),
        )
    }

    @Test
    fun `a byte-order mark does not break the document`() {
        assertEquals(
            setOf("rates"),
            ShellConfig.browserSurfaces("\uFEFF{\"browserSurfaces\": [\"rates\"]}"),
        )
    }
}
