// Which decoder the Scanner picks, and what makes it give up on the browser's
// own. jsdom ships neither `BarcodeDetector`, `Worker` nor `ImageData`, so all
// three are stood up here — the point of these tests is the *choice*, not the
// pixels behind it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScanEngine } from '@/frontend/ui/scan/scanner';

class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** The worker realm, reduced to the shape `createWasmEngine` touches. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage() {}
  terminate() {}
}

type DetectorBehaviour = 'answers' | 'unavailable' | 'stalls';

function stubNativeDetector(
  behaviour: DetectorBehaviour,
  { formats = ['qr_code', 'ean_13'], found = [] as unknown[] } = {}
) {
  const detect = vi.fn(() => {
    if (behaviour === 'stalls') return new Promise<never>(() => {});
    if (behaviour === 'unavailable') {
      return Promise.reject(
        new DOMException('Barcode detection service unavailable', 'NotSupportedError')
      );
    }
    return Promise.resolve(found);
  });

  class Detector {
    static getSupportedFormats = () => Promise.resolve(formats);
    detect = detect;
  }

  vi.stubGlobal('BarcodeDetector', Detector);
  return detect;
}

beforeEach(() => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createScanEngine', () => {
  it('uses the browser detector while it answers', async () => {
    stubNativeDetector('answers');

    const engine = await createScanEngine();

    expect(engine.kind).toBe('native');
  });

  it('falls back to the WASM worker when the browser detector has no service behind it', async () => {
    stubNativeDetector('unavailable');

    const engine = await createScanEngine();

    expect(engine.kind).toBe('wasm');
  });

  it('gives up on a detector that never settles, instead of stalling every frame', async () => {
    vi.useFakeTimers();
    stubNativeDetector('stalls');

    const pending = createScanEngine();
    await vi.advanceTimersByTimeAsync(5000);

    expect((await pending).kind).toBe('wasm');
  });

  it('prefers the WASM worker over a detector that knows none of our formats', async () => {
    stubNativeDetector('answers', { formats: ['nonsense'] });

    const engine = await createScanEngine();

    expect(engine.kind).toBe('wasm');
  });

  it('reports a native detection in frame coordinates', async () => {
    stubNativeDetector('answers', {
      found: [
        {
          rawValue: 'https://example.com',
          format: 'qr_code',
          boundingBox: { x: 4, y: 8, width: 16, height: 32 },
        },
      ],
    });

    const engine = await createScanEngine();
    const codes = await engine.detect(new FakeImageData(8, 8) as unknown as ImageData);

    expect(codes).toEqual([
      {
        rawValue: 'https://example.com',
        format: 'qr_code',
        box: { x: 4, y: 8, width: 16, height: 32 },
      },
    ]);
  });
});
