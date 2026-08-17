import { NextResponse, type NextRequest } from 'next/server';
import { loadBlogIndex } from '@/backend/loaders/blog';
import { BLOG_PAGE_SIZE } from '@/app/blog/_components/constants';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const query = params.get('q')?.trim() ?? '';

  const { posts, totalPages } = await loadBlogIndex(page, query, BLOG_PAGE_SIZE);

  return NextResponse.json({ posts, totalPages });
}
