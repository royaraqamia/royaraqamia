import { NextResponse, type NextRequest } from 'next/server';
import { loadCommunityIndex } from '@/backend/loaders/community';
import { COMMUNITY_PAGE_SIZE } from '@/app/community/_components/constants';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = params.get('q')?.trim() ?? '';

  const { posts, totalPages } = await loadCommunityIndex(page, query, COMMUNITY_PAGE_SIZE);

  return NextResponse.json({ posts, totalPages });
}
