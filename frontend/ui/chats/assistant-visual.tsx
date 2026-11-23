'use client';

import { useEffect, useRef, useState } from 'react';

import type { VisualSpec } from '@/shared/contracts/visual';

/**
 * Turn the assistant's SVG into a PNG in the page (ADR-0215).
 *
 * The deployment has no browser or ffmpeg on its Node service, so rasterizing
 * here is the only place that costs nothing. A thread reopened tomorrow draws
 * the same stored SVG the same way.
 */
export function AssistantVisual({ visual }: { visual: VisualSpec | null | undefined }) {
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const created = useRef<string[]>([]);

  useEffect(() => {
    setPngUrl(null);
    if (!visual?.svg) return;
    let cancelled = false;
    const svgUrl = URL.createObjectURL(new Blob([visual.svg], { type: 'image/svg+xml' }));
    created.current.push(svgUrl);
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth * 2;
      canvas.height = image.naturalHeight * 2;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (cancelled || !blob) return;
        const url = URL.createObjectURL(blob);
        created.current.push(url);
        setPngUrl(url);
      }, 'image/png');
    };
    image.src = svgUrl;
    return () => {
      cancelled = true;
    };
  }, [visual]);

  useEffect(
    () => () => {
      for (const url of created.current) URL.revokeObjectURL(url);
    },
    []
  );

  if (!visual) return null;
  return (
    <figure className="mt-2">
      {/* The SVG itself is the fallback while the canvas is still rasterizing. */}
      <img
        src={pngUrl ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(visual.svg)}`}
        alt={visual.caption ?? 'رسم توضيحي'}
        className="max-w-full rounded-lg border border-border/50"
      />
      {visual.caption ? (
        <figcaption className="mt-1 text-xs opacity-70">{visual.caption}</figcaption>
      ) : null}
    </figure>
  );
}
