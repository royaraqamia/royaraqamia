'use client';

// Field diagnostics for the Scanner, off unless the page is asked for them with
// `?debug=scan`. A phone cannot be attached to a desktop console mid-session as
// easily as it can be screenshotted, and "the camera reads nothing" has several
// unrelated causes: a decoder with no barcode service behind it, frames that
// arrive blank, a camera whose metadata never lands. This panel tells them apart
// without changing what a normal visitor sees.

import { useEffect, useState } from 'react';

/** The query flag that turns the panel on: `/scan?debug=scan`. */
const DEBUG_PARAM = 'debug';
const DEBUG_VALUE = 'scan';

export interface ScanDiagnostics {
  status: string;
  engine: string;
  video: string;
  frames: number;
  errors: number;
  codes: number;
  frame: string;
  error: string;
}

/** Whether this page load asked for diagnostics. */
export function useScanDebug(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get(DEBUG_PARAM) === DEBUG_VALUE);
  }, []);

  return enabled;
}

/**
 * Mean brightness and the share of pixels that are not near-black, for one
 * frame. A decoder handed a black frame is not broken — the frame is.
 */
export function describeFrame(frame: ImageData): string {
  const pixels = frame.data;
  let sum = 0;
  let lit = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const luminance =
      ((pixels[offset] ?? 0) + (pixels[offset + 1] ?? 0) + (pixels[offset + 2] ?? 0)) / 3;
    sum += luminance;
    if (luminance > 16) lit += 1;
  }
  const count = pixels.length / 4;
  return `${frame.width}x${frame.height} mean=${Math.round(sum / count)} lit=${(lit / count).toFixed(2)}`;
}

/** The panel itself: plain text, so it survives a screenshot. */
export function ScanDebugPanel({ diagnostics }: { diagnostics: ScanDiagnostics }) {
  return (
    <pre
      dir="ltr"
      data-scan-diagnostics=""
      className="pointer-events-none fixed inset-x-2 bottom-2 z-50 overflow-x-auto rounded-xl border border-border/60 bg-black/85 p-3 text-[10px] leading-relaxed text-lime-300"
    >
      {Object.entries(diagnostics)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}
    </pre>
  );
}
