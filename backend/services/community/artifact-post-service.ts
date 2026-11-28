import type { PostSourceKind } from '@/shared/contracts/blogpress';
import type { BlogpressPostsService } from '@/backend/services/blogpress/posts-service';
import { AppError } from '@/backend/shared/errors';

/** The text an artifact contributed, and the name it would carry as a post. */
export interface ArtifactText {
  body: string;
  /** A heading the artifact already has; null lets the first line name the post. */
  title: string | null;
}

/**
 * Reads one owned artifact from the product that produced it (#1952).
 *
 * Implemented by `backend/config/community.ts` over the notes and chat
 * repositories, both read through the caller's own client: a member can only
 * publish text they wrote or were written for them, and an id from another
 * account resolves to nothing.
 */
export interface ArtifactSourceReader {
  read(userId: string, kind: PostSourceKind, id: string): Promise<ArtifactText | null>;
}

/** The artifact is gone, deleted, or was never the caller's. */
export class ArtifactUnavailableError extends AppError {
  constructor() {
    super('المادَّة المطلوبة غير متاحة', 404, 'artifact_unavailable');
    this.name = 'ArtifactUnavailableError';
  }
}

const META_TITLE_MAX = 70;
const FALLBACK_TITLE = 'منشور جديد';

/** The first non-empty line, with any Markdown heading marker removed. */
function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const text = line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*+]\s+/, '')
      .trim();
    if (text) return text;
  }
  return '';
}

/** A slug the community route already accepts, independent of the text's language. */
function buildSlug(): string {
  return `post-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * The community's artifact door (#1952).
 *
 * The product already produces text worth reading — a note, an answer نور wrote
 * — and this turns one of those into a post draft with the member's byline and a
 * marker on where it came from. It writes through `BlogpressPostsService`, the
 * same draft write the assistant's `create_post_draft` tool uses, so the row's
 * shape and the author's ownership are decided in one place.
 *
 * The body is read here, never trusted from the request: the route sends an id,
 * so this door cannot publish arbitrary words under a member's name.
 */
export class ArtifactPostService {
  constructor(
    private readonly artifacts: ArtifactSourceReader,
    private readonly posts: BlogpressPostsService
  ) {}

  async createDraft(
    userId: string,
    kind: PostSourceKind,
    artifactId: string
  ): Promise<{ id: string; slug: string; content: string; metaTitle: string }> {
    const artifact = await this.artifacts.read(userId, kind, artifactId);
    const content = artifact?.body.trim() ?? '';
    if (!content) throw new ArtifactUnavailableError();

    const metaTitle = (artifact?.title?.trim() || firstLine(content) || FALLBACK_TITLE).slice(
      0,
      META_TITLE_MAX
    );
    const slug = buildSlug();

    const { id } = await this.posts.createDraft(userId, {
      slug,
      content,
      metaTitle,
      source: { kind, ref: artifactId },
    });

    return { id, slug, content, metaTitle };
  }
}
