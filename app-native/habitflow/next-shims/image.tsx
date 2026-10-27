'use client';

/**
 * `next/image` for the bundled surface.
 *
 * Outside Next there is no optimizer, so this is an `<img>`: the src the call
 * site passed, sized the way it asked for. `fill` is the one prop that carries
 * layout (the Next build styles the parent), and the spike keeps the same
 * contract by absolutely positioning the image inside a relative parent — the
 * call sites already set that on their wrapper.
 */

import type { CSSProperties } from 'react';

type StaticImport = { src: string; height: number; width: number; blurDataURL?: string };

export interface ImageProps {
  src: string | StaticImport;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
  quality?: number | string;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
  unoptimized?: boolean;
  [key: string]: unknown;
}

const FILL_STYLE: CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
};

export default function Image({
  src,
  alt,
  width,
  height,
  fill = false,
  sizes,
  className,
  style,
  priority,
  quality,
  placeholder,
  blurDataURL,
  loader,
  unoptimized,
  ...rest
}: ImageProps) {
  // Next-only props with no meaning outside it; read so the destructure stays
  // honest under `noUnusedLocals`.
  void priority;
  void quality;
  void placeholder;
  void blurDataURL;
  void loader;
  void unoptimized;

  const resolved = typeof src === 'string' ? src : src.src;

  return (
    <img
      src={resolved}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      sizes={sizes}
      className={className}
      style={fill ? { ...FILL_STYLE, ...style } : style}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      {...rest}
    />
  );
}
