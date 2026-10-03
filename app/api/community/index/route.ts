import { NextResponse, type NextRequest } from 'next/server';
import { loadCommunityIndex } from '@/backend/loaders/community';
import { COMMUNITY_PAGE_SIZE } from '@/app/community/_components/constants';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cursor = params.get('cursor') || null;
  const query = params.get('q')?.trim() ?? '';

  const { posts, nextCursor } = await loadCommunityIndex(cursor, query, COMMUNITY_PAGE_SIZE);

  return NextResponse.json({ posts, nextCursor });
}
