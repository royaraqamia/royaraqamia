import { NextResponse, type NextRequest } from 'next/server';
import { loadCommunitySearch } from '@/backend/loaders/community';

/** People + post suggestions for the community search combobox. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const result = await loadCommunitySearch(query);

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
