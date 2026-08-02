'use client';

import type { CSSProperties } from 'react';

export function SectionBackground({ blobs }: { blobs: CSSProperties[] }) {
  if (blobs.length === 0) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {blobs.map((style, i) => (
        <div key={i} className="absolute rounded-full" style={style} />
      ))}
    </div>
  );
}
