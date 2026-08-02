'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  webpSrc?: string;
  srcSet?: string;
  sizes?: string;
  priority?: boolean;
}

export function LazyImage({
  src,
  alt,
  className = '',
  width,
  height,
  sizes,
  priority = false,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={imgRef} className={`relative overflow-hidden ${className}`}>
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 skeleton animate-pulse bg-muted/20" />
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 text-muted-foreground text-xs">
          تعذّر تحميل الصورة
        </div>
      )}

      {!hasError && (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover transition-opacity duration-500 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
