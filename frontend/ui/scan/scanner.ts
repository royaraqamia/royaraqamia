// The Scanner's decoding engine, chosen per device and kept off the main thread.
//
// A browser with its own `BarcodeDetector` decodes in-process; anything else
// (Safari, Firefox) gets the WASM worker. Both answer the same `ScanEngine`
// shape, so the page never knows which one it is talking to (ADR-0035).

import { SCAN_FORMATS } from '@/shared/contracts/scan';
import { SCAN_FIXTURE_PAYLOAD, scanFixtureFrame } from './detector-fixture';
import type { DetectedCode, ScanFrameRequest, ScanFrameResponse } from './scan-worker';

/** The widest frame handed to a detector while scanning live video. */
export const SCAN_MAX_FRAME_WIDTH = 800;

/** The widest frame handed to a detector for an uploaded image. */
export const SCAN_MAX_UPLOAD_WIDTH = 2000;

/** Largest image we will decode from a file, in bytes. */
export const SCAN_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface ScanEngine {
  /** Which decoder answered: the browser's own, or our WASM worker. */
  readonly kind: 'native' | 'wasm';
  /** One line naming the decoder and the formats it was asked for, for field diagnostics. */
  readonly detail: string;
  detect(image: ImageData): Promise<DetectedCode[]>;
  dispose(): void;
}

interface NativeDetectedBarcode {
  rawValue: string;
  format: string;
  boundingBox: DOMRectReadOnly;
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmapSource): Promise<NativeDetectedBarcode[]>;
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

/** How long one decode may take before the detector behind it is given up on. */
const DETECT_TIMEOUT_MS = 4000;

/**
 * The detector's answer, or a rejection when it takes too long.
 *
 * A stalled decode is worse than a failed one: the frame loop serialises on it,
 * so a promise that never settles means nothing is ever read again and the
 * visitor is left with a live preview that does nothing.
 */
function withDetectTimeout<T>(answer: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('انتهت مهلة قراءة الرَّمز.')),
      DETECT_TIMEOUT_MS
    );
    answer.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('تعذَّرت قراءة الرَّمز.'));
      }
    );
  });
}

/**
 * Whether the detector can read a symbol we know the answer to.
 *
 * Existing is not the same as answering, and answering is not the same as
 * working. Chrome on Android builds its barcode backend as a component that may
 * be missing on the device, and a detector without it reports nothing for every
 * frame — the camera preview reads nothing, uploads fail, and no error is raised
 * to give the game away. So the detector has to read one known symbol before it
 * is handed the camera; anything less and the WASM engine takes over (ADR-0035
 * rejects a native detector that cannot keep the promise).
 */
async function nativeDetectorReadsFixture(detector: NativeBarcodeDetector): Promise<boolean> {
  try {
    const found = await withDetectTimeout(detector.detect(scanFixtureFrame()));
    return found.some((code) => code.rawValue === SCAN_FIXTURE_PAYLOAD);
  } catch {
    return false;
  }
}

function toDetectedCode(code: NativeDetectedBarcode): DetectedCode {
  return {
    rawValue: code.rawValue,
    format: String(code.format),
    box: {
      x: code.boundingBox.x,
      y: code.boundingBox.y,
      width: code.boundingBox.width,
      height: code.boundingBox.height,
    },
  };
}

/**
 * The browser's own detector, when it exists *and* supports enough of what we
 * promise. A native detector that knows only `qr_code` would silently break the
 * "any QR & barcode" promise, so a thin one is rejected in favour of the worker.
 */
/** Whether this browser exposes its own barcode detector at all. */
function hasBarcodeDetector(): boolean {
  return Boolean(
    (globalThis as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
      .BarcodeDetector
  );
}

async function createNativeEngine(): Promise<ScanEngine | null> {
  const Detector = (globalThis as unknown as { BarcodeDetector?: NativeBarcodeDetectorConstructor })
    .BarcodeDetector;
  if (!Detector) return null;
  let formats: string[] = [...SCAN_FORMATS];
  try {
    const supported = await Detector.getSupportedFormats?.();
    if (supported && supported.length > 0) {
      formats = SCAN_FORMATS.filter((format) => supported.includes(format));
      if (formats.length === 0) return null;
    }
  } catch {
    formats = [...SCAN_FORMATS];
  }

  try {
    const detector = new Detector({ formats });
    // Constructing a detector proves nothing: on Android the service behind it
    // can be absent, and reading a symbol we know is the only way to find out.
    if (!(await nativeDetectorReadsFixture(detector))) return null;
    return {
      kind: 'native',
      detail: `native (${formats.join(', ')})`,
      async detect(image) {
        const found = await withDetectTimeout(detector.detect(image));
        return found.map(toDetectedCode);
      },
      dispose() {
        // Nothing to release: the browser owns the decoder.
      },
    };
  } catch {
    return null;
  }
}

function createWasmEngine(detail = 'wasm (self-hosted zxing)'): ScanEngine {
  const worker = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<
    number,
    { resolve: (codes: DetectedCode[]) => void; reject: (error: Error) => void }
  >();
  let nextId = 0;

  function fail(error: Error) {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  }

  worker.onmessage = (event: MessageEvent<ScanFrameResponse>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if ('error' in message) entry.reject(new Error(message.error));
    else entry.resolve(message.codes);
  };
  worker.onerror = () => fail(new Error('تعذَّر تشغيل محرِّك القراءة.'));

  return {
    kind: 'wasm',
    detail,
    detect(image) {
      nextId += 1;
      const id = nextId;
      return new Promise<DetectedCode[]>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const request: ScanFrameRequest = { id, image };
        try {
          // The pixel buffer is handed over rather than copied.
          worker.postMessage(request, [image.data.buffer as ArrayBuffer]);
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error('تعذَّر إرسال الإطار.'));
        }
      });
    },
    dispose() {
      worker.terminate();
      fail(new Error('أُوقِف محرِّك القراءة.'));
    },
  };
}

/** The best decoder this device can offer. */
export async function createScanEngine(): Promise<ScanEngine> {
  const native = await createNativeEngine();
  const engine =
    native ??
    // Naming *why* the browser's detector was passed over is the difference
    // between a bug report we can act on and one we cannot.
    createWasmEngine(
      hasBarcodeDetector() ? 'wasm (native detector present, but it failed the check)' : undefined
    );

  // Which decoder a device ended up with is the first thing worth knowing when
  // a camera session reads nothing in the field.
  console.info(`[scan] decoding with ${engine.detail}`);
  return engine;
}

/**
 * Draws a video frame or a decoded image into a scratch canvas and reads it back
 * as pixels. The canvas is never attached to the document.
 */
export class FrameGrabber {
  private readonly canvas = document.createElement('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  grab(
    source: CanvasImageSource,
    sourceWidth: number,
    sourceHeight: number,
    maxWidth: number
  ): ImageData | null {
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, maxWidth / sourceWidth);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    if (this.width !== width || this.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
      this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.context) return null;

    this.context.drawImage(source, 0, 0, width, height);
    return this.context.getImageData(0, 0, width, height);
  }
}

/** Decodes an uploaded image file into pixels for the engine. */
export async function imageDataFromFile(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const frame = new FrameGrabber().grab(
      bitmap,
      bitmap.width,
      bitmap.height,
      SCAN_MAX_UPLOAD_WIDTH
    );
    if (!frame) throw new Error('تعذَّر قراءة الصُّورة.');
    return frame;
  } finally {
    bitmap.close();
  }
}

/** The largest code in the frame — what a visitor is most likely pointing at. */
export function largestCode(codes: DetectedCode[]): DetectedCode | null {
  let best: DetectedCode | null = null;
  let bestArea = -1;
  for (const code of codes) {
    const area = code.box.width * code.box.height;
    if (area > bestArea) {
      bestArea = area;
      best = code;
    }
  }
  return best;
}

/** The smallest code containing a point, so a tap picks the box under the finger. */
export function codeAtPoint(codes: DetectedCode[], x: number, y: number): DetectedCode | null {
  let match: DetectedCode | null = null;
  let smallest = Number.POSITIVE_INFINITY;
  for (const code of codes) {
    const { x: boxX, y: boxY, width, height } = code.box;
    if (x < boxX || y < boxY || x > boxX + width || y > boxY + height) continue;
    const area = width * height;
    if (area < smallest) {
      smallest = area;
      match = code;
    }
  }
  return match;
}
