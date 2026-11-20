package com.royaraqamia.app.shell

import com.royaraqamia.app.ShellServer
import java.io.BufferedReader
import java.io.InputStream
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONException
import org.json.JSONObject

/**
 * The shell's remote configuration (#661).
 *
 * The escape hatch is one document beside the update manifest: the app already
 * trusts the origin in `BuildConfig.SITE_URL` for `/android/latest.json`
 * ([com.royaraqamia.app.ShellUpdate]), and this is the same origin and the same
 * `public/android/` directory. Reading it from here means one remote source the
 * shell already reaches, rather than a second service to keep alive.
 *
 * The document is deliberately tiny and empty by default:
 *
 * ```json
 * { "browserSurfaces": [] }
 * ```
 *
 * `browserSurfaces` names surfaces (`community`, `rates`, the ids in
 * `docs/mobile/screens.json`) or routes (`/community/explore`). A name is a
 * switch for that surface only; an empty list is the app as shipped, so a
 * missing file, an empty file or an unreadable one all mean "draw it natively".
 *
 * Everything that decides is pure and JVM-testable; only [read] touches the
 * network, and it answers the empty set for every failure — the escape hatch
 * exists so a changed switch is a deploy rather than a release, not so a bad
 * deploy can take the app's screens away.
 */
object ShellConfig {
    /** Where the document lives, beside the manifest the update check reads. */
    const val PATH = "/android/config.json"

    private const val CONNECT_TIMEOUT_MS = 4_000
    private const val READ_TIMEOUT_MS = 4_000

    /**
     * The configuration URL for the origin the shell was built against. Null when
     * the configured origin is not a URL at all, which the caller reports rather
     * than guessing.
     */
    fun configUrl(serverUrl: String?): String? = ShellServer.pageUrl(serverUrl, PATH)

    /**
     * The surfaces the switch names, read out of the document.
     *
     * A document with no `browserSurfaces`, or one that is not the shape this
     * expects, is the empty set: the safe reading of a broken switch is the app
     * as shipped. Blank entries are dropped, so a hand-edited file cannot switch
     * every surface on with one stray `""`.
     */
    fun browserSurfaces(json: String): Set<String> =
        try {
            val root = JSONObject(json.replace("\uFEFF", ""))
            val rows = root.optJSONArray("browserSurfaces") ?: return emptySet()
            (0 until rows.length())
                .mapNotNull { index ->
                    rows.optString(index, "").trim().takeIf { it.isNotEmpty() }
                }
                .toSet()
        } catch (_: JSONException) {
            emptySet()
        }

    /**
     * Reads the document and answers the surfaces it names.
     *
     * Every failure — no URL, a refused request, a socket that never answers, a
     * body that is not JSON — is the empty set, which draws every surface
     * natively. The read is deliberately no-cache: a switch that a device cannot
     * hear because it kept an old copy is a switch that did nothing.
     */
    fun read(url: String?): Set<String> {
        if (url.isNullOrEmpty()) return emptySet()

        var connection: HttpURLConnection? = null
        return try {
            connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")
            connection.useCaches = false
            connection.setRequestProperty("Cache-Control", "no-cache")

            if (connection.responseCode != HttpURLConnection.HTTP_OK) {
                emptySet()
            } else {
                browserSurfaces(readFully(connection.inputStream))
            }
        } catch (_: Exception) {
            emptySet()
        } finally {
            connection?.disconnect()
        }
    }

    private fun readFully(stream: InputStream): String =
        BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { reader ->
            val body = StringBuilder()
            var line = reader.readLine()
            while (line != null) {
                body.append(line).append('\n')
                line = reader.readLine()
            }
            body.toString()
        }
}
