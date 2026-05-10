import { useState, useEffect, useRef } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  /** WebP version of the image (optional) */
  webpSrc?: string;
  /** Responsive image srcset (optional) - e.g., "image-400w.webp 400w, image-800w.webp 800w" */
  srcSet?: string;
  /** Sizes attribute for responsive images (optional) */
  sizes?: string;
  /** Priority loading for above-the-fold images */
  priority?: boolean;
}

/**
 * Enhanced LazyImage component with WebP support and responsive images
 * - Lazy loads images with IntersectionObserver
 * - Supports WebP format with fallback
 * - Supports responsive images (srcset)
 * - Includes loading skeleton
 */
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
  const [isInView, setIsInView] = useState(false);
  const [webpSupported, setWebpSupported] = useState<boolean | null>(null);
  const imgRef = useRef<HTMLDivElement>(null);

  // Check WebP support
  useEffect(() => {
    const checkWebPSupport = () => {
      const webP = new Image();
      webP.onload = webP.onerror = () => {
        setWebpSupported(webP.height === 2);
      };
      webP.src =
        'data:image/webp;base64,UklGRjoAAABXRUJQVlA4IC4AAACyAgCdASoCAAIALmk0mk0iIiIiIgBoSygABc6WWgAA/veff/0PP8bA//LwYAAA';
    };
    checkWebPSupport();
  }, []);

  useEffect(() => {
    // If priority is true, load immediately
    if (priority) {
      setIsInView(true);
      return;
    }

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

  // Determine which image source to use
  const imageSrc = webpSrc && webpSupported ? webpSrc : src;
  const imageSrcSet = webpSupported && srcSet ? srcSet : undefined;

  return (
    <div ref={imgRef} className={`relative overflow-hidden ${className}`}>
      {/* Skeleton Placeholder */}
      {!isLoaded && <div className="absolute inset-0 skeleton animate-pulse bg-muted/20" />}

      {/* Actual Image with WebP support */}
      {isInView && (
        <picture>
          {/* WebP source if available and supported */}
          {webpSrc && webpSupported !== null && webpSupported && srcSet && (
            <source srcSet={srcSet} sizes={sizes} type="image/webp" />
          )}
          {/* Fallback: JPEG/PNG source */}
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
