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
 * - **That there is a hash at all.** A manifest without one describes an APK
 *   nobody can check, so it is refused rather than trusted because it arrived
 *   over https.
 * - **The size.** A download cut short by a flaky connection is what a phone
 *   actually produces, and Android will open a half file.
 * - **The SHA-256.** The file is about to be handed to the platform installer;
 *   this is the only thing standing between a document on the network and what
 *   gets installed.
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
     * leaves no file behind — nothing unverified is ever readable at `target`.
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

            long declared = connection.getContentLengthLong();
            long total = declared > 0 ? declared : expectedBytes;
            long received = 0;
            MessageDigest digest = sha256();

            try (InputStream in = new BufferedInputStream(connection.getInputStream());
                    FileOutputStream out = new FileOutputStream(part)) {
                byte[] buffer = new byte[BUFFER_BYTES];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    digest.update(buffer, 0, read);
                    received += read;
                    report(progress, received, total);
                }
            }

            // A server that closes the stream early looks like a successful read
            // here, so the length is what catches a truncated download.
            if (expectedBytes > 0 && received != expectedBytes) {
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
        // A delete that fails leaves a file the next attempt overwrites, in
        // storage only this app can read; not worth an error or a log.
        if (file != null) file.delete();
    }
}
