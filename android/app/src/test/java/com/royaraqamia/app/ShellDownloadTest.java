package com.royaraqamia.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.Closeable;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The download half of the install (ADR-0044), on the JVM.
 *
 * `ShellDownload` holds no Android classes on purpose, so what is exercised here
 * is the real thing over a real socket: a body that arrives whole, a body cut
 * short by a server that lied about its length, a body that is simply not the one
 * the manifest described, and the reuse of a file verified on an earlier attempt.
 *
 * Every failure has to leave the directory empty. Whatever is left at the target
 * path is a file the system installer could be handed, and that is the whole
 * reason this class verifies before it renames.
 */
public class ShellDownloadTest {

    private static final byte[] BODY = body(300_000, 7);

    private Server server;
    private File directory;
    private File target;

    @Before
    public void setUp() throws IOException {
        server = new Server();
        directory = Files.createTempDirectory("shell-download-test").toFile();
        target = new File(directory, "royaraqamia-shell-20001.apk");
    }

    @After
    public void tearDown() throws IOException {
        server.close();
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                file.delete();
            }
        }
        directory.delete();
    }

    @Test
    public void downloadsAndVerifiesTheFile() throws Exception {
        server.serve(BODY);
        AtomicLong received = new AtomicLong();
        AtomicLong total = new AtomicLong();

        File downloaded = ShellDownload.fetch(
            server.url(),
            target,
            BODY.length,
            sha256(BODY),
            (read, of) -> {
                received.set(read);
                total.set(of);
            }
        );

        assertEquals(target.getCanonicalFile(), downloaded.getCanonicalFile());
        assertArrayEquals(BODY, Files.readAllBytes(target.toPath()));
        assertEquals(BODY.length, received.get());
        assertEquals(BODY.length, total.get());
        assertEquals(1, server.requests());
        // The .part file is what was written; only the verified rename is visible.
        assertEquals(Arrays.toString(directory.listFiles()), 1, directory.listFiles().length);
    }

    @Test
    public void reusesAFileThatStillVerifies() throws Exception {
        Files.write(target.toPath(), BODY);

        File downloaded = ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null);

        assertEquals(target.getCanonicalFile(), downloaded.getCanonicalFile());
        assertArrayEquals(BODY, Files.readAllBytes(target.toPath()));
        // Ten megabytes over a phone connection buy nothing when the checked file
        // is already there.
        assertEquals(0, server.requests());
    }

    @Test
    public void replacesAFileThatDoesNotVerify() throws Exception {
        Files.write(target.toPath(), "not the published apk".getBytes(StandardCharsets.UTF_8));
        server.serve(BODY);

        ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null);

        assertEquals(1, server.requests());
        assertArrayEquals(BODY, Files.readAllBytes(target.toPath()));
    }

    @Test
    public void aTruncatedDownloadLeavesNothingBehind() throws Exception {
        server.serveTruncated(BODY);

        IOException error = assertThrows(
            IOException.class,
            () -> ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null)
        );

        assertTrue(error.getMessage(), error instanceof ShellDownload.VerificationFailed);
        assertFalse(target.exists());
        assertDirectoryIsEmpty();
    }

    @Test
    public void aBodyThatIsNotThePublishedOneIsRefused() throws Exception {
        // Same length, different bytes: only the hash can tell.
        server.serve(body(BODY.length, 11));

        IOException error = assertThrows(
            IOException.class,
            () -> ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null)
        );

        assertTrue(error.getMessage(), error.getMessage().contains("hashes to"));
        assertFalse(target.exists());
        assertDirectoryIsEmpty();
    }

    @Test
    public void withoutAPublishedHashNothingIsDownloaded() throws Exception {
        server.serve(BODY);

        for (String hash : new String[] { "", "   ", null, "not-a-hash", "ab".repeat(31) }) {
            IOException error = assertThrows(
                IOException.class,
                () -> ShellDownload.fetch(server.url(), target, BODY.length, hash, null)
            );
            assertTrue(String.valueOf(error), error instanceof ShellDownload.VerificationFailed);
        }

        // Refused before the network was touched: an unchecked APK is not one to
        // fetch on the chance that it is fine.
        assertEquals(0, server.requests());
        assertDirectoryIsEmpty();
    }

    @Test
    public void anHttpErrorIsNotAFile() throws Exception {
        server.serveStatus(404);

        IOException error = assertThrows(
            IOException.class,
            () -> ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null)
        );

        assertTrue(error.getMessage(), error.getMessage().contains("404"));
        assertDirectoryIsEmpty();
    }

    @Test
    public void withoutAPublishedSizeNothingIsDownloaded() throws Exception {
        // A manifest that does not say how big the file is cannot bound the
        // download, so it is refused for the same reason a missing hash is.
        server.serve(BODY);

        for (long size : new long[] { 0, -1 }) {
            IOException error = assertThrows(
                IOException.class,
                () -> ShellDownload.fetch(server.url(), target, size, sha256(BODY), null)
            );
            assertTrue(String.valueOf(error), error instanceof ShellDownload.VerificationFailed);
        }

        assertEquals(0, server.requests());
        assertDirectoryIsEmpty();
    }

    @Test
    public void aBodyLongerThanTheManifestDescribesIsRefused() throws Exception {
        // The server sends everything; the manifest says the APK is smaller. The
        // extra bytes are not what was published, and writing them to the device
        // serves no purpose.
        server.serve(BODY);

        IOException error = assertThrows(
            IOException.class,
            () -> ShellDownload.fetch(server.url(), target, BODY.length - 1000, sha256(BODY), null)
        );

        assertTrue(error.getMessage(), error.getMessage().contains("longer than"));
        assertFalse(target.exists());
        assertDirectoryIsEmpty();
    }

    @Test
    public void aStalePartialFileDoesNotSurvive() throws Exception {
        // What a download that was killed mid-flight leaves behind. It is never
        // installable, and the next attempt clears it.
        Files.write(new File(directory, target.getName() + ".part").toPath(), "half a download".getBytes(StandardCharsets.UTF_8));
        server.serve(BODY);

        ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null);

        assertEquals(Arrays.toString(directory.listFiles()), 1, directory.listFiles().length);
        assertArrayEquals(BODY, Files.readAllBytes(target.toPath()));
    }

    @Test
    public void theTargetOnlyAppearsWhenTheFileIsVerified() throws Exception {
        // The claim the rename exists for: while the bytes are still arriving,
        // nothing is readable at the path the installer is handed.
        server.servePausedAfterHalf(BODY);
        Thread download = new Thread(() -> {
            try {
                ShellDownload.fetch(server.url(), target, BODY.length, sha256(BODY), null);
            } catch (Exception error) {
                // Reaching this is a failure of the assertions below, not here.
            }
        });
        download.setDaemon(true);
        download.start();

        assertTrue("the server should have paused mid-body", server.awaitPause(20));
        Thread.sleep(300);
        assertFalse("the verified file must not exist yet", target.exists());
        File[] during = directory.listFiles();
        assertNotNull(during);
        for (File file : during) {
            assertTrue(file.getName(), file.getName().endsWith(".part"));
        }

        server.release();
        download.join(20_000);
        assertFalse(download.isAlive());
        assertArrayEquals(BODY, Files.readAllBytes(target.toPath()));
    }

    @Test
    public void normalizeHashAcceptsOnlyAHexDigest() {
        String digest = "ab".repeat(32);

        assertEquals(digest, ShellDownload.normalizeHash("AB".repeat(32)));
        assertEquals(digest, ShellDownload.normalizeHash("  " + digest + "\n"));

        assertNull(ShellDownload.normalizeHash(null));
        assertNull(ShellDownload.normalizeHash(""));
        assertNull(ShellDownload.normalizeHash("ab".repeat(31)));
        assertNull(ShellDownload.normalizeHash("zz".repeat(32)));
    }

    @Test
    public void sha256MatchesTheKnownDigestOfAKnownInput() throws Exception {
        // The digest of "abc", so this checks our hex rather than our plumbing.
        String expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

        assertEquals(
            expected,
            ShellDownload.sha256Hex(new ByteArrayInputStream("abc".getBytes(StandardCharsets.US_ASCII)))
        );

        File file = new File(directory, "abc");
        Files.write(file.toPath(), "abc".getBytes(StandardCharsets.US_ASCII));
        assertEquals(expected, ShellDownload.sha256Hex(file));
    }

    private void assertDirectoryIsEmpty() {
        File[] files = directory.listFiles();
        assertNotNull(files);
        assertEquals(Arrays.toString(files), 0, files.length);
    }

    private static byte[] body(int size, long seed) {
        byte[] bytes = new byte[size];
        new Random(seed).nextBytes(bytes);
        return bytes;
    }

    private static String sha256(byte[] bytes) throws Exception {
        StringBuilder out = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(bytes)) {
            out.append(String.format("%02x", value));
        }
        return out.toString();
    }

    /** A real HTTP server: the code under test opens a real socket. */
    private static final class Server implements Closeable {

        private final ServerSocket socket;
        private final AtomicInteger requests = new AtomicInteger();
        private final Thread thread;
        private volatile byte[] payload;
        private volatile int status = 500;
        private volatile boolean truncate;
        private volatile CountDownLatch pausedAfterHalf;
        private volatile CountDownLatch released;

        Server() throws IOException {
            socket = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            thread = new Thread(this::accept, "shell-download-test-server");
            thread.setDaemon(true);
            thread.start();
        }

        String url() {
            return "http://127.0.0.1:" + socket.getLocalPort() + "/royaraqamia-shell.apk";
        }

        int requests() {
            return requests.get();
        }

        void serve(byte[] body) {
            payload = body;
            status = 200;
            truncate = false;
        }

        /** Says it is sending the whole file and sends less, which is what a dropped link looks like. */
        void serveTruncated(byte[] body) {
            payload = body;
            status = 200;
            truncate = true;
        }

        void serveStatus(int code) {
            status = code;
        }

        /** Sends half the body, waits to be released, then sends the rest. */
        void servePausedAfterHalf(byte[] body) {
            payload = body;
            status = 200;
            truncate = false;
            released = new CountDownLatch(1);
            pausedAfterHalf = new CountDownLatch(1);
        }

        boolean awaitPause(long seconds) throws InterruptedException {
            CountDownLatch latch = pausedAfterHalf;
            return latch != null && latch.await(seconds, TimeUnit.SECONDS);
        }

        void release() {
            CountDownLatch latch = released;
            if (latch != null) latch.countDown();
        }

        @Override
        public void close() throws IOException {
            socket.close();
        }

        private void accept() {
            while (!socket.isClosed()) {
                try (Socket client = socket.accept()) {
                    serve(client);
                } catch (IOException closed) {
                    return;
                }
            }
        }

        private void serve(Socket client) throws IOException {
            requests.incrementAndGet();
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(client.getInputStream(), StandardCharsets.ISO_8859_1)
            );
            String line;
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                // The request headers, read only so the client is not left writing.
            }

            OutputStream out = client.getOutputStream();
            if (status != 200) {
                out.write(("HTTP/1.1 " + status + " Error\r\nContent-Length: 0\r\n\r\n")
                    .getBytes(StandardCharsets.ISO_8859_1));
                out.flush();
                return;
            }

            byte[] body = payload;
            int sent = truncate ? body.length - 1000 : body.length;
            out.write(("HTTP/1.1 200 OK\r\n"
                + "Content-Type: application/vnd.android.package-archive\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Connection: close\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));

            CountDownLatch pauseNow = pausedAfterHalf;
            if (pauseNow == null) {
                out.write(body, 0, sent);
                out.flush();
                return;
            }

            int half = body.length / 2;
            out.write(body, 0, half);
            out.flush();
            pauseNow.countDown();
            try {
                released.await(20, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            out.write(body, half, sent - half);
            out.flush();
        }
    }
}
