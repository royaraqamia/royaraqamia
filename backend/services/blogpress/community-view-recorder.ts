import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';

export class CommunityPostViewRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من الطلبات. الرجاء المحاولة بعد قليل.');
    this.name = 'CommunityPostViewRateLimitError';
  }
}

// 120 view requests per 10 minutes per IP, 30 per 10 minutes per post slug.
// Sliding windows bound a spammer or a misbehaving crawler while letting a
// genuinely popular post keep counting.
const IP_LIMIT = 120;
const SLUG_LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

export interface CommunityViewRecorderDeps {
  repository: Pick<PostsRepository, 'getPublishedPostBySlug' | 'incrementPostViewCount'>;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  captureMessage: (
    message: string,
    options?: { level?: 'info' | 'warning'; extra?: Record<string, unknown> }
  ) => void;
}

/**
 * Records a public community view. The RPC is a server-side write (service role),
 * so every public request must pass this recorder first: per-IP and per-slug
 * rate limits prevent the endpoint from being used to inflate view counts.
 */
export class CommunityViewRecorder {
  constructor(private readonly deps: CommunityViewRecorderDeps) {}

  async recordView(slug: string, ip: string): Promise<void> {
    if (!(await this.deps.checkRateLimit(`community-view:${ip}`, IP_LIMIT, WINDOW_MS))) {
      this.deps.captureMessage('Community post view IP rate limit exceeded', {
        level: 'warning',
        extra: { slug, ip },
      });
      throw new CommunityPostViewRateLimitError();
    }

    if (!(await this.deps.checkRateLimit(`community-view:${slug}`, SLUG_LIMIT, WINDOW_MS))) {
      this.deps.captureMessage('Community post view slug rate limit exceeded', {
        level: 'warning',
        extra: { slug, ip },
      });
      throw new CommunityPostViewRateLimitError();
    }

    const post = await this.deps.repository.getPublishedPostBySlug(slug);
    if (!post) return;

    await this.deps.repository.incrementPostViewCount(post.id);
  }
}

export function createCommunityViewRecorder(
  deps: CommunityViewRecorderDeps
): CommunityViewRecorder {
  return new CommunityViewRecorder(deps);
}
