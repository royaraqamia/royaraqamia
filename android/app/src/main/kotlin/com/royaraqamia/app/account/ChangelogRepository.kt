package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.AndroidChangelog

/**
 * The Android changelog (#951): the one static file the weekly train writes.
 *
 * `public/android/changelog.json` is served beside the site, not behind the
 * GitHub API, because release assets are unreachable from at least one country
 * the app has users in (ADR-0047). It is public, so the read carries no bearer
 * ([ApiClient.getPublic]), exactly like the page's own fetch.
 *
 * The page reads the file defensively (`frontend/shared/android-changelog.ts`):
 * a release with no version or no notes is dropped rather than drawn as an empty
 * card. [releasesOf] is that same rule on this side, and it is pure so the JVM
 * test can ask it without a server.
 */
class ChangelogRepository(private val client: ApiClient) {
    suspend fun releases(): ApiResult<List<ChangelogRelease>> =
        when (val result = client.getPublic<AndroidChangelog>(CHANGELOG_PATH)) {
            is ApiResult.Success -> ApiResult.Success(releasesOf(result.value))
            is ApiResult.Failure -> result
        }

    companion object {
        const val CHANGELOG_PATH = "/android/changelog.json"

        /** How many releases the page shows, even if the file ever carries more. */
        const val PAGE_LIMIT = 20
    }
}

/** One release the screen draws: the version line, its date and its notes. */
data class ChangelogRelease(
    val version: String,
    val releasedAt: String,
    val notes: List<String>,
)

/**
 * The releases worth drawing, newest first as the file writes them.
 *
 * A release with no version or no notes says nothing, so it is dropped rather
 * than rendered as an empty shell. The trim is the page's own defence against a
 * half-written note, and the limit keeps a long file from making an endless
 * screen.
 */
internal fun releasesOf(changelog: AndroidChangelog): List<ChangelogRelease> =
    changelog.releases
        .map { release ->
            ChangelogRelease(
                version = release.version.trim(),
                releasedAt = release.releasedAt.trim(),
                notes = release.notes.map(String::trim).filter(String::isNotEmpty),
            )
        }
        .filter { release -> release.version.isNotEmpty() && release.notes.isNotEmpty() }
        .take(ChangelogRepository.PAGE_LIMIT)
