'use client';

import { useState, useEffect, useRef } from 'react';

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

let webpSupportedCache: boolean | null = null;
let webpCheckInitiated = false;
const webpResolveQueue: Array<(value: boolean) => void> = [];

function getWebpSupport(): Promise<boolean> {
  return new Promise((resolve) => {
    if (webpSupportedCache !== null) {
      resolve(webpSupportedCache);
      return;
    }
    webpResolveQueue.push(resolve);
    if (webpCheckInitiated) return;
    webpCheckInitiated = true;
    const webP = new Image();
    webP.onload = webP.onerror = () => {
      webpSupportedCache = webP.height === 2;
      webpResolveQueue.splice(0).forEach((fn) => fn(webpSupportedCache!));
    };
    webP.src =
      'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
  });
}

export function LazyImage({
  src,
  alt,
  className = '',
  width,
  height,
  webpSrc,
  srcSet,
  sizes,
  priority = false,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(priority);
  const [webpSupported, setWebpSupported] = useState<boolean | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getWebpSupport().then(setWebpSupported);
  }, []);

  useEffect(() => {
    if (priority) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [priority]);

  const imageSrc = webpSrc && webpSupported ? webpSrc : src;

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

      {isInView && !hasError && (
        <picture>
          {webpSrc && webpSupported !== null && webpSupported && srcSet && (
            <source srcSet={srcSet} sizes={sizes} type="image/webp" />
          )}
          <img
            src={imageSrc}
            alt={alt}
            width={width}
            height={height}
            srcSet={!webpSupported && srcSet ? srcSet : undefined}
            sizes={sizes}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={`w-full h-full object-cover transition-opacity duration-500 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              aspectRatio: width && height ? `${width} / ${height}` : undefined,
            }}
          />
        </picture>
      )}
    </div>
  );
}
