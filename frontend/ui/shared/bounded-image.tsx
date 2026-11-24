'use client';

import Image, { type ImageProps } from 'next/image';

import { boundedImageLoader } from '@/frontend/ui/shared/bounded-image-loader';

/**
 * An `next/image` whose source is a member upload. The loader prop has to be a
 * function, so this wrapper is a Client Component; the cards and avatars that
 * draw stored images all use it.
 */
export function BoundedImage(props: ImageProps) {
  return <Image {...props} loader={boundedImageLoader} />;
}
