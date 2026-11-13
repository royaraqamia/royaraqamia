import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { mcpCapabilityName } from '@/backend/services/tools/mcp-capabilities';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { createPostsRepository } from '@/backend/config/blogpress';
import type { PostSummary } from '@/shared/contracts/blogpress';
import { postExcerpt } from '@/shared/reading-time';
import {
  buildPaginationMeta,
  formatDate,
  truncate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ResponseFormatSchema,
} from './shared';

/**
 * BlogPress + Community read tools. BlogPress is the content product (manage
 * your own posts) and Community is its public reader (published posts under
 * /community) â€” both share the `blogpress` contract and repository. These tools
 * operate on the caller's own posts when authenticated, and on public published
 * content when anonymous. The user-scoped client enforces
 * `posts_select_own_or_published` RLS.
 */

const ListPostsInputSchema = z
  .object({
    page_size: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE)
      .describe(`Results per page (default ${DEFAULT_PAGE_SIZE})`),
    offset: z.number().int().min(0).default(0).describe('0-based offset for pagination'),
    format: ResponseFormatSchema,
  })
  .strict();

const GetPostInputSchema = z
  .object({
    id: z.string().min(1).optional().describe('Post id (own posts only)'),
    slug: z.string().min(1).optional().describe('Post slug (public published posts)'),
    format: ResponseFormatSchema,
  })
  .strict();

type ListPostsInput = z.infer<typeof ListPostsInputSchema>;
type GetPostInput = z.infer<typeof GetPostInputSchema>;

function serializePost(post: PostSummary) {
  return {
    id: post.id,
    excerpt: postExcerpt(post.content, post.meta_desc ?? ''),
    slug: post.slug,
    status: post.status,
    cover_image: post.cover_image,
    meta_desc: post.meta_desc,
    published_at: post.published_at,
    publish_at: post.publish_at,
    view_count: post.view_count,
    featured: post.featured,
    community_visible: post.community_visible,
    reading_time_minutes: post.reading_time_minutes,
    created_at: post.created_at,
    updated_at: post.updated_at,
  };
}

export async function listPostsHandler(
  params: ListPostsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    const repo = createPostsRepository(ctx.supabase as never);

    if (ctx.userId) {
      requireAnyScope(ctx, ['community.read']);
      const posts = await repo.listPostsByAuthor(ctx.userId);
      const start = params.offset;
      const page = posts.slice(start, start + params.page_size);
      const meta = buildPaginationMeta(posts.length, page.length, params.offset);
      const items = page.map(serializePost);

      if (params.format === 'json') {
        return structuredResponse(jsonText({ posts: items, ...meta }), { posts: items, ...meta });
      }

      const lines = [
        '# Your Community Posts',
        '',
        `Found ${meta.total} post${meta.total === 1 ? '' : 's'}.`,
        '',
      ];
      for (const p of items) {
        lines.push(
          `- **${p.excerpt || '(untitled)'}** (${p.status}) â€” views: ${p.view_count}${
            p.community_visible ? ', visible' : ''
          } | \`${p.id}\``
        );
      }
      if (meta.has_more) {
        lines.push('', `(Showing ${meta.count} of ${meta.total}; use offset to continue.)`);
      }
      return structuredResponse(lines.join('\n'), { posts: items, ...meta });
    }

    // Anonymous: public published feed.
    const page = params.offset / params.page_size + 1;
    const result = await repo.getPublishedPosts(page, '', params.page_size);
    const items = result.posts.map(serializePost);
    const meta = {
      total: result.posts.length,
      count: result.posts.length,
      offset: params.offset,
      has_more: page < result.totalPages,
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText({ posts: items, ...meta }), { posts: items, ...meta });
    }

    const lines = ['# Published Posts', '', `Total pages: ${result.totalPages}.`, ''];
    for (const p of items) {
      lines.push(`- **${p.excerpt || '(untitled)'}** (${p.slug}) â€” views: ${p.view_count}`);
    }
    return structuredResponse(lines.join('\n'), { posts: items, ...meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function getPostHandler(
  params: GetPostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    const repo = createPostsRepository(ctx.supabase as never);

    if (params.id) {
      requireAnyScope(ctx, ['community.read']);
      requireUserId(ctx, 'Getting a specific post');
      const post = await repo.getPostForUser(params.id, ctx.userId!);
      if (!post) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Post not found or you do not own it.' }],
        };
      }
      const serialized = serializePost(post);
      if (params.format === 'json') {
        return structuredResponse(jsonText(serialized), serialized);
      }
      const truncated = truncate(post.content ?? '');
      return structuredResponse(
        [
          `# ${postExcerpt(post.content, post.meta_desc ?? '') || '(untitled)'}`,
          '',
          `- **Status**: ${post.status}`,
          `- **Slug**: ${post.slug}`,
          `- **Views**: ${post.view_count}`,
          `- **Published**: ${formatDate(post.published_at)}`,
          `- **Reading time**: ${post.reading_time_minutes ?? 'â€”'} min`,
          '',
          truncated.text,
        ].join('\n'),
        serialized
      );
    }

    if (params.slug) {
      const post = await repo.getPublishedPostBySlug(params.slug);
      if (!post) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Published post not found.' }],
        };
      }
      const serialized = serializePost(post);
      if (params.format === 'json') {
        return structuredResponse(jsonText(serialized), serialized);
      }
      const truncated = truncate(post.content ?? '');
      return structuredResponse(
        [
          `# ${postExcerpt(post.content, post.meta_desc ?? '') || '(untitled)'}`,
          '',
          `- **Slug**: ${post.slug}`,
          `- **Views**: ${post.view_count}`,
          `- **Published**: ${formatDate(post.published_at)}`,
          `- **Reading time**: ${post.reading_time_minutes ?? 'â€”'} min`,
          '',
          truncated.text,
        ].join('\n'),
        serialized
      );
    }

    return {
      isError: true,
      content: [
        { type: 'text', text: 'Provide either "id" (own post) or "slug" (published post).' },
      ],
    };
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerCommunityTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    mcpCapabilityName('community.list_posts'),
    {
      title: 'List Community Posts',
      description: `Lists community posts. Authenticated callers get their own posts (all statuses); anonymous callers get the public published feed.
Requires the "community.read" scope when authenticated.

Args:
  - page_size (number, default 20, max 100): results per page
  - offset (number, default 0): 0-based pagination offset
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "posts": Post[], "total": number, "count": number, "offset": number, "has_more": boolean }

Examples:
  - Use when: "list my posts" -> page_size=10
  - Use when: "show published posts" -> format="json"`,
      inputSchema: ListPostsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listPostsHandler(params, ctx)
  );

  server.registerTool(
    mcpCapabilityName('community.get_post'),
    {
      title: 'Get Community Post',
      description: `Gets a single community post. Provide "id" to fetch one of your own posts (requires "community.read"), or "slug" to fetch a public published post (works anonymously).

Args:
  - id (string, optional): your post id
  - slug (string, optional): slug of a public published post
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): a Post object including content.

Examples:
  - Use when: "show my post abc123" -> id="abc123"
  - Use when: "get post how-to-start" -> slug="how-to-start"`,
      inputSchema: GetPostInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getPostHandler(params, ctx)
  );
}

// ============================================================
// Write tools (community.write)
// ============================================================

const CreatePostInputSchema = z.object({ format: ResponseFormatSchema }).strict();

const UpdatePostInputSchema = z
  .object({
    id: z.string().min(1).describe('The post id to update'),
    slug: z
      .string()
      .min(1)
      .regex(/^[\w\u0600-\u06FF-]+$/)
      .optional(),
    content: z.string().optional(),
    cover_image: z.string().optional(),
    meta_title: z.string().max(70).optional(),
    meta_desc: z.string().max(160).optional(),
    format: ResponseFormatSchema,
  })
  .strict();

const PublishPostInputSchema = z
  .object({
    id: z.string().min(1).describe('The post id to publish'),
    format: ResponseFormatSchema,
  })
  .strict();

const UnpublishPostInputSchema = z
  .object({
    id: z.string().min(1).describe('The post id to unpublish'),
    format: ResponseFormatSchema,
  })
  .strict();

const DeletePostInputSchema = z
  .object({
    id: z.string().min(1).describe('The post id to delete'),
    format: ResponseFormatSchema,
  })
  .strict();

type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
type UpdatePostInput = z.infer<typeof UpdatePostInputSchema>;
type PublishPostInput = z.infer<typeof PublishPostInputSchema>;
type UnpublishPostInput = z.infer<typeof UnpublishPostInputSchema>;
type DeletePostInput = z.infer<typeof DeletePostInputSchema>;

export async function createPostHandler(
  params: CreatePostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['community.write']);
    const userId = requireUserId(ctx, 'Creating a post');
    const repo = createPostsRepository(ctx.supabase as never);
    const { id } = await repo.createPost(userId);

    const output = { id, message: 'Draft post created.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Post Created\n\nNew draft post created with id \`${id}\`.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function updatePostHandler(
  params: UpdatePostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['community.write']);
    const userId = requireUserId(ctx, 'Updating a post');
    const repo = createPostsRepository(ctx.supabase as never);

    const input: Record<string, string | undefined> = {};
    if (params.slug !== undefined) input.slug = params.slug;
    if (params.content !== undefined) input.content = params.content;
    if (params.cover_image !== undefined) input.cover_image = params.cover_image;
    if (params.meta_title !== undefined) input.meta_title = params.meta_title;
    if (params.meta_desc !== undefined) input.meta_desc = params.meta_desc;

    await repo.updatePost(params.id, userId, input as never);

    const output = { id: params.id, message: 'Post updated.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Post Updated\n\nPost \`${params.id}\` saved.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function publishPostHandler(
  params: PublishPostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['community.write']);
    const userId = requireUserId(ctx, 'Publishing a post');
    const repo = createPostsRepository(ctx.supabase as never);
    const { slug } = await repo.publishPost(params.id, userId);

    const output = { id: params.id, slug, message: 'Post published.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Post Published\n\nPost \`${params.id}\` is live at \`/${slug}\`.`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function unpublishPostHandler(
  params: UnpublishPostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['community.write']);
    const userId = requireUserId(ctx, 'Unpublishing a post');
    const repo = createPostsRepository(ctx.supabase as never);
    const { slug } = await repo.unpublishPost(params.id, userId);

    const output = { id: params.id, slug, message: 'Post unpublished.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Post Unpublished\n\nPost \`${params.id}\` (\`/${slug}\`) is now a draft.`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function deletePostHandler(
  params: DeletePostInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['community.write']);
    const userId = requireUserId(ctx, 'Deleting a post');
    const repo = createPostsRepository(ctx.supabase as never);
    const { slug } = await repo.deletePost(params.id, userId);

    const output = { id: params.id, slug, message: 'Post deleted.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          // A replayed delete of a row that is already gone carries no slug.
          slug
            ? `# Post Deleted\n\nPost \`${params.id}\` (\`/${slug}\`) was deleted.`
            : `# Post Deleted\n\nPost \`${params.id}\` was deleted.`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerCommunityWriteTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    mcpCapabilityName('community.create_post'),
    {
      title: 'Create Community Post',
      description: `Creates a new draft community post. Requires the "community.write" scope and an authenticated session.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "create a new community post draft"`,
      inputSchema: CreatePostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createPostHandler(params, ctx)
  );

  server.registerTool(
    mcpCapabilityName('community.update_post'),
    {
      title: 'Update Community Post',
      description: `Updates one of your community posts (slug, content, cover image, meta). Requires "community.write" and an authenticated session.

Args:
  - id (string, required): the post id
  - slug (string, optional): URL slug
  - content (string, optional): post body (HTML/markdown)
  - cover_image (string, optional): cover image URL
  - meta_title (string, optional, max 70)
  - meta_desc (string, optional, max 160)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "set the body of post abc123" -> id="abc123", content="..."`,
      inputSchema: UpdatePostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => updatePostHandler(params, ctx)
  );

  server.registerTool(
    mcpCapabilityName('community.publish_post'),
    {
      title: 'Publish Community Post',
      description: `Publishes one of your draft/scheduled community posts. Requires "community.write" and an authenticated session. Posts by admin users are made visible on the public community.

Args:
  - id (string, required): the post id
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "slug": string, "message": string }

Examples:
  - Use when: "publish my post abc123" -> id="abc123"`,
      inputSchema: PublishPostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => publishPostHandler(params, ctx)
  );

  server.registerTool(
    mcpCapabilityName('community.unpublish_post'),
    {
      title: 'Unpublish Community Post',
      description: `Returns one of your published posts to draft. Requires "community.write" and an authenticated session.

Args:
  - id (string, required): the post id
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "slug": string, "message": string }

Examples:
  - Use when: "unpublish my post abc123" -> id="abc123"`,
      inputSchema: UnpublishPostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => unpublishPostHandler(params, ctx)
  );

  server.registerTool(
    mcpCapabilityName('community.delete_post'),
    {
      title: 'Delete Community Post',
      description: `Permanently deletes one of your community posts. Requires "community.write" and an authenticated session.

Args:
  - id (string, required): the post id
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "slug": string, "message": string }

Examples:
  - Use when: "delete my post abc123" -> id="abc123"`,
      inputSchema: DeletePostInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => deletePostHandler(params, ctx)
  );
}

export type {
  ListPostsInput,
  GetPostInput,
  CreatePostInput,
  UpdatePostInput,
  PublishPostInput,
  UnpublishPostInput,
  DeletePostInput,
};
