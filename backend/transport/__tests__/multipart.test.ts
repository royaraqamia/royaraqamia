import { describe, expect, it } from 'vitest';
import { MultipartTooLargeError, declaredTooLarge, readMultipartBytes } from '../multipart';

/**
 * A real multipart body, written by hand: jsdom's `FormData` does not serialize
 * the boundary into a Node `Request` the way the runtime does, and this test is
 * about the stream the route actually receives.
 */
function upload(bytes: number): Request {
  const boundary = '----royaraqamia-test';
  const body =
    `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="file"; filename="a.png"\r\n' +
    'Content-Type: image/png\r\n\r\n' +
    'x'.repeat(bytes) +
    `\r\n--${boundary}--\r\n`;

  return new Request('https://site.example/upload', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

describe('declaredTooLarge', () => {
  it('only answers when the header declares more than the budget', () => {
    expect(declaredTooLarge(null, 10)).toBe(false);
    expect(declaredTooLarge('10', 10)).toBe(false);
    expect(declaredTooLarge('11', 10)).toBe(true);
    expect(declaredTooLarge('not-a-number', 10)).toBe(false);
  });
});

describe('readMultipartBytes', () => {
  it('reads a body inside the budget as it arrived', async () => {
    const bytes = await readMultipartBytes(upload(1024), 64 * 1024);
    const body = new TextDecoder().decode(bytes);

    expect(body).toContain('filename="a.png"');
    expect(body).toContain('x'.repeat(1024));
    expect(body.endsWith('--\r\n')).toBe(true);
  });

  it('refuses a body over the budget before keeping it', async () => {
    await expect(readMultipartBytes(upload(200_000), 64 * 1024)).rejects.toBeInstanceOf(
      MultipartTooLargeError
    );
  });
});
