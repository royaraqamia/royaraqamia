// The Scanner's decoding engine, chosen per device and kept off the main thread.
//
// A browser with its own `BarcodeDetector` decodes in-process; anything else
// (Safari, Firefox) gets the WASM worker. Both answer the same `ScanEngine`
// shape, so the page never knows which one it is talking to (ADR-0035).

import { SCAN_FORMATS } from '@/shared/contracts/scan';
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
    return {
      kind: 'native',
      async detect(image) {
        const found = await detector.detect(image);
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

function createWasmEngine(): ScanEngine {
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
  return (await createNativeEngine()) ?? createWasmEngine();
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
