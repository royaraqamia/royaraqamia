import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { createPostsRepository } from '@/backend/repositories/blogpress/posts';
import type { PostSummary } from '@/shared/contracts/blogpress';
import {
  buildPaginationMeta,
  formatDate,
  truncate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ResponseFormatSchema,
} from './shared';

/**
 * BlogPress + Blog read tools. BlogPress is the content product (manage your
 * own posts under /blogpress) and Blog is its public reader (published posts
 * under /blog) — both share the `blogpress` contract and repository. These
 * tools operate on the caller's own posts/categories/tags when authenticated,
 * and on public published content when anonymous. The user-scoped client
 * enforces `posts_select_own_or_published` RLS and the per-author
 * blog_categories / blog_tags policies.
 */

const ListPostsInputSchema = z
  .object({
    category_slug: z
      .string()
      .min(1)
      .optional()
      .describe('Filter by category slug (own posts only)'),
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

const ListCategoriesInputSchema = z.object({ format: ResponseFormatSchema }).strict();

const ListTagsInputSchema = z.object({ format: ResponseFormatSchema }).strict();

type ListPostsInput = z.infer<typeof ListPostsInputSchema>;
type GetPostInput = z.infer<typeof GetPostInputSchema>;
type ListCategoriesInput = z.infer<typeof ListCategoriesInputSchema>;
type ListTagsInput = z.infer<typeof ListTagsInputSchema>;

function serializePost(post: PostSummary) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    cover_image: post.cover_image,
    meta_desc: post.meta_desc,
    published_at: post.published_at,
    publish_at: post.publish_at,
    view_count: post.view_count,
    featured: post.featured,
    blog_visible: post.blog_visible,
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
      requireAnyScope(ctx, ['blog.read']);
      const posts = await repo.listPostsByAuthor(ctx.userId, params.category_slug);
      const start = params.offset;
      const page = posts.slice(start, start + params.page_size);
      const meta = buildPaginationMeta(posts.length, page.length, params.offset);
      const items = page.map(serializePost);

      if (params.format === 'json') {
        return structuredResponse(jsonText({ posts: items, ...meta }), { posts: items, ...meta });
      }

      const lines = [
        `# Your Blog Posts${params.category_slug ? ` (category: ${params.category_slug})` : ''}`,
        '',
        `Found ${meta.total} post${meta.total === 1 ? '' : 's'}.`,
        '',
      ];
      for (const p of items) {
        lines.push(
          `- **${p.title || '(untitled)'}** (${p.status}) — views: ${p.view_count}${
            p.blog_visible ? ', visible' : ''
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
      lines.push(`- **${p.title || '(untitled)'}** (${p.slug}) — views: ${p.view_count}`);
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
      requireAnyScope(ctx, ['blog.read']);
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
          `# ${post.title || '(untitled)'}`,
          '',
          `- **Status**: ${post.status}`,
          `- **Slug**: ${post.slug}`,
          `- **Views**: ${post.view_count}`,
          `- **Published**: ${formatDate(post.published_at)}`,
          `- **Reading time**: ${post.reading_time_minutes ?? '—'} min`,
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
          `# ${post.title || '(untitled)'}`,
          '',
          `- **Slug**: ${post.slug}`,
          `- **Views**: ${post.view_count}`,
          `- **Published**: ${formatDate(post.published_at)}`,
          `- **Reading time**: ${post.reading_time_minutes ?? '—'} min`,
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

export async function listCategoriesHandler(
  params: ListCategoriesInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    const repo = createPostsRepository(ctx.supabase as never);

    if (ctx.userId) {
      requireAnyScope(ctx, ['blog.read']);
      const categories = await repo.listCategoriesByAuthor(ctx.userId);
      if (params.format === 'json') {
        return structuredResponse(jsonText(categories), { categories });
      }
      const lines = ['# Your Blog Categories', ''];
      for (const c of categories) {
        lines.push(`- **${c.name}** (\`${c.slug}\`)`);
      }
      return structuredResponse(lines.join('\n'), { categories });
    }

    const categories = await repo.getPublishedCategories();
    if (params.format === 'json') {
      return structuredResponse(jsonText(categories), { categories });
    }
    const lines = ['# Published Blog Categories', ''];
    for (const c of categories) {
      lines.push(`- **${c.name}** (\`${c.slug}\`)`);
    }
    return structuredResponse(lines.join('\n'), { categories });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function listTagsHandler(
  params: ListTagsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['blog.read']);
    const userId = requireUserId(ctx, 'Listing tags');
    const repo = createPostsRepository(ctx.supabase as never);
    const tags = await repo.listTagsByAuthor(userId);

    if (params.format === 'json') {
      return structuredResponse(jsonText(tags), { tags });
    }
    const lines = ['# Your Blog Tags', ''];
    for (const t of tags) {
      lines.push(`- **${t.name}** (\`${t.slug}\`)`);
    }
    return structuredResponse(lines.join('\n'), { tags });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerBlogTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_blog_list_posts`,
    {
      title: 'List Blog Posts',
      description: `Lists blog posts. Authenticated callers get their own posts (all statuses); anonymous callers get the public published feed.
Requires the "blog.read" scope when authenticated.

Args:
  - category_slug (string, optional): filter own posts by category slug
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
    `${MCP_SERVER_NAME}_blog_get_post`,
    {
      title: 'Get Blog Post',
      description: `Gets a single blog post. Provide "id" to fetch one of your own posts (requires "blog.read"), or "slug" to fetch a public published post (works anonymously).

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

  server.registerTool(
    `${MCP_SERVER_NAME}_blog_list_categories`,
    {
      title: 'List Blog Categories',
      description: `Lists blog categories. Authenticated callers get their own categories (requires "blog.read"); anonymous callers get published categories.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "categories": PostCategory[] }

Examples:
  - Use when: "what categories do I have"`,
      inputSchema: ListCategoriesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listCategoriesHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_blog_list_tags`,
    {
      title: 'List Blog Tags',
      description: `Lists your blog tags. Requires the "blog.read" scope and an authenticated session.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "tags": PostTag[] }

Examples:
  - Use when: "what tags do I have"`,
      inputSchema: ListTagsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listTagsHandler(params, ctx)
  );
}

export type { ListPostsInput, GetPostInput, ListCategoriesInput, ListTagsInput };
