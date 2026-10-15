package com.royaraqamia.app;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

/**
 * Downloads the published APK and verifies it before anyone is offered it
 * (ADR-0044).
 *
 * Deliberately free of Android classes: this is the part that decides whether a
 * file is the file the manifest named, and that decision is worth testing on the
 * JVM against a real HTTP server (`ShellDownloadTest`) rather than on a device.
 *
 * Three things are checked, each because of a failure that is otherwise silent:
 *
 * - **That the manifest describes the file at all** — a hash and a size. Without
 *   them the download cannot be checked or bounded, so it is refused rather than
 *   trusted because it arrived over https.
 * - **The size**, because a download cut short by a flaky connection is what a
 *   phone actually produces, Android will open a half file, and a server that
 *   sends more than was described is not sending the file we asked for.
 * - **The SHA-256**, because the file is about to be handed to the platform
 *   installer.
 *
 * What the hash is *not*: a trust boundary. The hash and the URL arrive in the
 * same manifest, so this catches a truncated, stale, cached or otherwise
 * unexpected file — not a hostile one, because anything that can rewrite the
 * manifest can rewrite both fields. What stops a rewritten manifest from becoming
 * an installed app is Android's own rule that an update has to be signed by the
 * key the installed app was signed with, which is why `android:publish` refuses to
 * publish a key that `assetlinks.json` does not list.
 */
final class ShellDownload {

    interface Progress {
        void onProgress(long received, long total);
    }

    /** The download did not produce the file the manifest described. */
    static final class VerificationFailed extends IOException {
        VerificationFailed(String message) {
            super(message);
        }
    }

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int BUFFER_BYTES = 64 * 1024;
    private static final int HASH_HEX_LENGTH = 64;

    private ShellDownload() {}

    /**
     * The verified APK at `target`, downloading it if it is not already there.
     *
     * An APK that is already present and still hashes correctly is left alone:
     * another ten megabytes over a phone connection buys nothing, and this is
     * also what makes a retry after a declined install cheap. Anything that fails
     * leaves no file behind — nothing unverified is ever readable at `target`,
     * because the verified file only appears there by being renamed into place.
     */
    static File fetch(
            String url, File target, long expectedBytes, String expectedSha256, Progress progress)
            throws IOException {
        final String expected = normalizeHash(expectedSha256);
        if (expected == null) {
            throw new VerificationFailed(
                    "the manifest publishes no usable sha256, so this APK cannot be checked: "
                            + expectedSha256);
        }
        if (expectedBytes <= 0) {
            throw new VerificationFailed(
                    "the manifest does not say how big the APK is, so the download cannot be bounded: "
                            + expectedBytes);
        }

        if (target.isFile() && expected.equals(sha256Hex(target))) {
            report(progress, target.length(), target.length());
            return target;
        }

        File part = new File(target.getParentFile(), target.getName() + ".part");
        deleteQuietly(part);

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + code + " from " + url);
            }

            long received = 0;
            MessageDigest digest = sha256();

            try (InputStream in = new BufferedInputStream(connection.getInputStream());
                    FileOutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[BUFFER_BYTES];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    received += read;
                    // Counted before it is written: a body longer than the manifest
                    // described is not the file that was asked for, and there is no
                    // reason to keep writing it to the device.
                    if (received > expectedBytes) {
                        throw new VerificationFailed(
                                "the download is longer than the manifest's " + expectedBytes + " bytes");
                    }
                    out.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    report(progress, received, expectedBytes);
                }
            }

            // A server that closes the stream early looks like a successful read
            // here, so the length is what catches a truncated download.
            if (received != expectedBytes) {
                throw new VerificationFailed(
                        "the download is " + received + " bytes, the manifest says " + expectedBytes);
            }

            String actual = hex(digest.digest());
            if (!expected.equals(actual)) {
                throw new VerificationFailed(
                        "the download hashes to " + actual + ", the manifest says " + expected);
            }

            // Renaming is what makes the file appear at `target`: readers only
            // ever see a complete, verified APK. An earlier file at `target` is
            // known not to verify (this path is only reached when it does not), so
            // it goes first — `renameTo` refuses to replace an existing file on
            // some platforms.
            if (target.exists() && !target.delete()) {
                throw new IOException("could not replace the old download at " + target);
            }
            if (!part.renameTo(target)) {
                throw new IOException("could not move the verified download into " + target);
            }
            return target;
        } catch (IOException error) {
            deleteQuietly(part);
            throw error;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static String sha256Hex(File file) throws IOException {
        try (InputStream in = new BufferedInputStream(new FileInputStream(file))) {
            return sha256Hex(in);
        }
    }

    static String sha256Hex(InputStream in) throws IOException {
        MessageDigest digest = sha256();
        byte[] buffer = new byte[BUFFER_BYTES];
        int read;
        while ((read = in.read(buffer)) != -1) {
            digest.update(buffer, 0, read);
        }
        return hex(digest.digest());
    }

    /** A 64-character hex digest, lowercased, or null when that is not what this is. */
    static String normalizeHash(String hash) {
        if (hash == null) return null;
        String trimmed = hash.trim().toLowerCase(Locale.ROOT);
        if (trimmed.length() != HASH_HEX_LENGTH) return null;
        for (int index = 0; index < trimmed.length(); index++) {
            char character = trimmed.charAt(index);
            boolean isHex = (character >= '0' && character <= '9') || (character >= 'a' && character <= 'f');
            if (!isHex) return null;
        }
        return trimmed;
    }

    private static MessageDigest sha256() throws IOException {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("SHA-256 is not available", error);
        }
    }

    private static String hex(byte[] digest) {
        StringBuilder out = new StringBuilder(digest.length * 2);
        for (byte value : digest) {
            out.append(String.format(Locale.ROOT, "%02x", value));
        }
        return out.toString();
    }

    private static void report(Progress progress, long received, long total) {
        if (progress != null) progress.onProgress(received, total);
    }

    private static void deleteQuietly(File file) {
        // A delete that fails leaves a file the next download removes before it
        // writes (`ShellInstaller.fetch` also sweeps the directory), in storage
        // only this app can read; not worth an error or a log.
        if (file != null) file.delete();
    }
}
