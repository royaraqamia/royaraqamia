/**
 * A multipart body read with a ceiling, before it becomes a `FormData`.
 *
 * `request.formData()` buffers the whole body first and checks the file's size
 * afterwards. On the 512 MB free instance that is the wrong order: a body the
 * edge allows through is resident before any controller sees it. This reads the
 * stream, refuses the moment the declared or counted bytes cross the file's own
 * limit plus a small multipart overhead, and only then parses.
 *
 * The residual case is a client that sends neither a `Content-Length` nor a
 * finite body; the counted stream still stops at the same ceiling.
 */

/** Boundaries and part headers; a few hundred bytes for the two files here. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

export class MultipartTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super('multipart body exceeds its budget');
    this.name = 'MultipartTooLargeError';
  }
}

/** The declared length alone already answers the question. */
export function declaredTooLarge(header: string | null, limitBytes: number): boolean {
  if (!header) return false;
  const declared = Number(header);
  return Number.isFinite(declared) && declared > limitBytes;
}

/**
 * The body's bytes, or `MultipartTooLargeError` before the extra bytes are held.
 * The caller owns the `FormData` step; this function owns the ceiling, which is
 * the part that has to be true on every runtime.
 */
export async function readMultipartBytes(
  request: Request,
  fileLimitBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  const limitBytes = fileLimitBytes + MULTIPART_OVERHEAD_BYTES;

  if (declaredTooLarge(request.headers.get('content-length'), limitBytes)) {
    throw new MultipartTooLargeError(limitBytes);
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MultipartTooLargeError(limitBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * The parsed form. A request already consumed elsewhere falls back to
 * `formData()`; the two routes that use this hand it an unread one.
 */
export async function readMultipartWithin(
  request: Request,
  fileLimitBytes: number
): Promise<FormData> {
  if (request.bodyUsed) return request.formData();

  const bytes = await readMultipartBytes(request, fileLimitBytes);
  const contentType = request.headers.get('content-type') ?? '';
  return new Response(bytes, {
    headers: contentType ? { 'content-type': contentType } : {},
  }).formData();
}
