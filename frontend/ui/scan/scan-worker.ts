// The decoding worker: the Scanner's WASM path for browsers without a native
// `BarcodeDetector` (Safari, Firefox).
//
// It runs off the main thread so decoding never contends with the camera preview
// (ADR-0035), and it receives `ImageData` because that is structured-cloneable
// and needs no DOM to convert.

import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill';
import { SCAN_FORMATS } from '@/shared/contracts/scan';
import { SCANNER_WASM_PATH } from '@/frontend/shared/constants';

/** One frame handed to the worker for decoding. */
export interface ScanFrameRequest {
  id: number;
  image: ImageData;
}

export interface DetectedCode {
  rawValue: string;
  format: string;
  /** In frame coordinates, which is what the overlay scales from. */
  box: { x: number; y: number; width: number; height: number };
}

export type ScanFrameResponse =
  { id: number; codes: DetectedCode[] } | { id: number; error: string };

// The engine must come from our own origin (ADR-0035): the library's default is a
// jsDelivr CDN URL, which `script-src 'self'` forbids and the page's privacy
// claim rules out.
prepareZXingModule({
  overrides: {
    locateFile: (path: string) => (path.endsWith('.wasm') ? SCANNER_WASM_PATH : path),
  },
});

const detector = new BarcodeDetector({ formats: [...SCAN_FORMATS] });

// The `webworker` lib is not in this project's `tsconfig` `lib` list, so the
// worker scope is typed structurally rather than through `DedicatedWorkerGlobalScope`.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScanFrameRequest>) => void) | null;
  postMessage: (message: ScanFrameResponse) => void;
};

scope.onmessage = async (event) => {
  const { id, image } = event.data;
  try {
    const found = await detector.detect(image);
    scope.postMessage({
      id,
      codes: found.map((code) => ({
        rawValue: code.rawValue,
        format: String(code.format),
        box: {
          x: code.boundingBox.x,
          y: code.boundingBox.y,
          width: code.boundingBox.width,
          height: code.boundingBox.height,
        },
      })),
    });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : 'decode failed' });
  }
};
