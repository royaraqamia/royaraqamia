import { NextRequest, NextResponse } from 'next/server';

import { optimizeImage } from '@/backend/services/images/optimize-image';

/**
 * The decode slot lives around the work this route does, so concurrent first
 * hits for a cover queue instead of each materialising the whole source in
 * the one 512 MiB origin (#1787).
 */
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const result = await optimizeImage({
    src: params.get('url') ?? '',
    width: Number(params.get('w') ?? 0),
    quality: Number(params.get('q') ?? 0),
    accept: req.headers.get('accept') ?? '',
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: 'الصورة غير متاحة' },
      { status: result.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': result.contentType,
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    ETag: result.etag,
    Vary: 'Accept',
  };

  if (req.headers.get('if-none-match') === result.etag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(new Uint8Array(result.bytes), { status: 200, headers });
}
