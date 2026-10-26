package com.royaraqamia.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * The one network seam the native recitation has, so the store and the manifest
 * reader can be tested without a socket (and so a future retry/backoff has one
 * place to live).
 */
interface QuranHttp {
    byte[] get(String url) throws IOException;
}

final class UrlQuranHttp implements QuranHttp {

    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 30_000;

    @Override
    public byte[] get(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        // The manifest publishes exact byte counts and hashes; a transparent
        // gzip would make the count a lie.
        connection.setRequestProperty("Accept-Encoding", "identity");

        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                throw new IOException("HTTP " + status + " for " + url);
            }
            try (
                InputStream input = connection.getInputStream();
                ByteArrayOutputStream output = new ByteArrayOutputStream()
            ) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                return output.toByteArray();
            }
        } finally {
            connection.disconnect();
        }
    }
}
