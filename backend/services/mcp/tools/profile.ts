import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { createUserProfileRepository } from '@/backend/repositories/users/user-profile-repository';

/**
 * Profile read tool. Reads the caller's own row in the `users` table using the
 * user-scoped client; the "Users can view own profile" RLS policy
 * (auth.uid() = id) scopes the result to the caller.
 */

const GetProfileInputSchema = z
  .object({
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

type GetProfileInput = z.infer<typeof GetProfileInputSchema>;

export async function getProfileHandler(
  params: GetProfileInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['profile.read']);
    const userId = requireUserId(ctx, 'Getting your profile');
    const repo = createUserProfileRepository(ctx.supabase as never);
    const profile = await repo.getById(userId);

    if (!profile) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Profile not found.' }],
      };
    }

    const output = {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      avatar_url: profile.avatar_url,
      bio: profile.bio,
      is_admin: profile.is_admin,
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText(output), output);
    }

    const lines = [
      '# Your Profile',
      '',
      `- **Name**: ${profile.name ?? '—'}`,
      `- **Email**: ${profile.email}`,
      `- **Bio**: ${profile.bio ?? '—'}`,
    ];
    return structuredResponse(lines.join('\n'), output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerProfileTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_profile_get`,
    {
      title: 'Get Profile',
      description: `Returns your profile: name, email, bio, avatar, and admin flag. Requires the "profile.read" scope and an authenticated session.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "email": string, "name": string|null, "avatar_url": string|null, "bio": string|null, "is_admin": boolean }

Examples:
  - Use when: "what is my profile"`,
      inputSchema: GetProfileInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getProfileHandler(params, ctx)
  );
}

export type { GetProfileInput };
