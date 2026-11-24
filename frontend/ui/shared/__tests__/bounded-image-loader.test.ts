import { describe, expect, it } from 'vitest';

import { boundedImageLoader } from '@/frontend/ui/shared/bounded-image-loader';

describe('boundedImageLoader', () => {
  it('routes stored images through the slot-guarded optimizer', () => {
    const src = 'https://abc.supabase.co/storage/v1/object/public/post-images/u/cover.webp';
    const url = new URL(boundedImageLoader({ src, width: 576, quality: 80 }), 'http://localhost');

    expect(url.pathname).toBe('/api/media/optimize');
    expect(url.searchParams.get('url')).toBe(src);
    expect(url.searchParams.get('w')).toBe('576');
    expect(url.searchParams.get('q')).toBe('80');
  });

  it('leaves every other source on the default optimizer', () => {
    expect(boundedImageLoader({ src: '/01.webp', width: 640 })).toBe(
      '/_next/image?url=%2F01.webp&w=640&q=75'
    );
    expect(boundedImageLoader({ src: 'https://example.com/cover.png', width: 320 })).toBe(
      '/_next/image?url=https%3A%2F%2Fexample.com%2Fcover.png&w=320&q=75'
    );
  });
});
