import {
  CHAT_IMAGE_LONGEST_SIDE_PX,
  CHAT_IMAGE_MAX_BYTES,
  chatAttachmentIsInlineImage,
} from '@/shared/contracts/chat';

/**
 * A picture, small enough to be a prompt (ADR-0139).
 *
 * The assistant sees an image as an image part inside the request body, which
 * makes its size a cost on every round and a ceiling the provider enforces with
 * an opaque 413. A phone photo is 8–12 MB and 4000 px wide — far more than a
 * model needs to read a receipt, a table or an error dialog — so the page
 * shrinks it before it uploads it: 1600 px on the longest side, WebP when the
 * browser can encode it (it keeps transparency) and JPEG otherwise, and under
 * 4 MB.
 *
 * The same bytes serve the thread, so what the member sees is what the model
 * read. An image that is already inside those bounds is uploaded untouched: a
 * small screenshot is not worth a second lossy pass. A picture the browser
 * cannot decode (HEIC on most desktop browsers) is returned as it is, and the
 * server's own answer — one sentence saying it cannot read it — is what the
 * member gets; silently dropping it would be worse.
 */

/** The quality the first encode uses, and the one a stubborn file falls back to. */
const WEBP_QUALITY = 0.85;
const JPEG_QUALITY = 0.85;
const JPEG_FLOOR_QUALITY = 0.6;

/** The extension each encoding keeps, so the object's name matches its bytes. */
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * What a picture's dimensions become: the same shape, with the longest side at
 * most `longest`. Exported because it is the whole rule, and a rule worth a test
 * without a canvas.
 */
export function imageTargetSize(
  width: number,
  height: number,
  longest: number = CHAT_IMAGE_LONGEST_SIDE_PX
): { width: number; height: number } | null {
  const side = Math.max(width, height);
  if (!Number.isFinite(side) || !Number.isFinite(Math.min(width, height)) || side <= 0) return null;
  if (side <= longest) return { width, height };

  const scale = longest / side;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** The same picture under the name its new bytes deserve. */
export function imageFileName(fileName: string, mimeType: string): string {
  const extension = EXTENSIONS[mimeType.trim().toLowerCase()];
  if (!extension) return fileName;

  const stem = fileName.replace(/\.[^./\\]+$/, '').trim() || 'image';
  return `${stem}.${extension}`;
}

/**
 * One picked file, downscaled if it is a picture that needs it. Anything else —
 * a recording, a text file, an image already inside the bounds — comes back as
 * it was.
 */
export async function shrinkChatImage(file: File): Promise<File> {
  if (!chatAttachmentIsInlineImage(file.type)) return file;
  // Not every runtime has the decoder (a test environment, an old WebView):
  // the file goes up as it is rather than the composer refusing it.
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    const target = imageTargetSize(bitmap.width, bitmap.height);
    if (!target) return file;

    const unchanged = target.width === bitmap.width && target.height === bitmap.height;
    if (unchanged && file.size <= CHAT_IMAGE_MAX_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    const encoded = await encode(canvas);
    if (!encoded) return file;

    return new File([encoded], imageFileName(file.name, encoded.type), {
      type: encoded.type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}

/** The smallest acceptable encoding of a drawn picture, or `null`. */
async function encode(canvas: HTMLCanvasElement): Promise<Blob | null> {
  // WebP first: it keeps an alpha channel, which a screenshot of a dialog
  // usually has, and it is smaller than JPEG at the same quality.
  const webp = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
  if (webp && webp.type === 'image/webp' && webp.size <= CHAT_IMAGE_MAX_BYTES) return webp;

  // JPEG is the encoding every browser can produce; a transparent pixel would
  // become black, so the shape is laid on white first.
  const flat = flattened(canvas);
  const firm = await toBlob(flat, 'image/jpeg', JPEG_QUALITY);
  if (firm && firm.size <= CHAT_IMAGE_MAX_BYTES) return firm;

  const floor = await toBlob(flat, 'image/jpeg', JPEG_FLOOR_QUALITY);
  if (!floor) return firm;
  return !firm || floor.size < firm.size ? floor : firm;
}

/** The same drawing on a white card, because JPEG has no transparency. */
function flattened(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement('canvas');
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext('2d');
  if (!context) return canvas;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, copy.width, copy.height);
  context.drawImage(canvas, 0, 0);
  return copy;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
