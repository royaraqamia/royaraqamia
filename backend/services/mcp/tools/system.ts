import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { appVersion } from '@/backend/config/generated/app-version';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';

/**
 * Diagnostics / system-level tools for the public MCP server. These need no
 * data-plane access, so they work for anonymous and authenticated callers
 * alike and are useful for verifying the transport and session wiring.
 */

const GetServerInfoInputSchema = z
  .object({
    format: z.enum(['markdown', 'json']).default('markdown').describe('Output format'),
  })
  .strict();

type GetServerInfoInput = z.infer<typeof GetServerInfoInputSchema>;

export async function getServerInfoHandler(
  params: GetServerInfoInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    const output = {
      server: MCP_SERVER_NAME,
      server_version: MCP_SERVER_VERSION,
      release_version: appVersion.releaseVersion,
      semver: appVersion.semver,
      commit: appVersion.commit,
      ref: appVersion.ref,
      env: appVersion.env,
      user: {
        userId: ctx.userId,
        email: ctx.email,
        isAdmin: ctx.isAdmin,
      },
      scopes: ctx.scopes,
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText(output), output);
    }

    const lines = [
      `# ${output.server} MCP Server`,
      '',
      `- **Server version**: ${output.server_version}`,
      `- **Release**: ${output.release_version}`,
      `- **Commit**: ${output.commit}`,
      `- **Branch**: ${output.ref}`,
      `- **Env**: ${output.env}`,
      '',
      `- **Authenticated as**: ${ctx.email ?? '(anonymous)'}`,
      `- **Is admin**: ${ctx.isAdmin}`,
      `- **Scopes**: ${ctx.scopes.length > 0 ? ctx.scopes.join(', ') : '(none)'}`,
    ];
    return structuredResponse(lines.join('\n'), output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerSystemTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_server_info`,
    {
      title: 'Server Info',
      description: `Returns identity information about the royaraqamia MCP server and the current caller: server version, deployed release, the authenticated user (or anonymous), whether they are an admin, and the granted OAuth scopes.

Read-only: does not modify anything. No database access required. Available to anonymous callers.

Args:
  - format ('markdown' | 'json', default 'markdown'): Output format

Returns:
  For JSON format, structured data with schema:
  { "server": string, "server_version": string, "release_version": string, "semver": string, "commit": string, "ref": string, "env": string, "user": { "userId": string|null, "email": string|null, "isAdmin": boolean }, "scopes": string[] }

Examples:
  - Use when: "What is the MCP server version?" -> format="markdown"
  - Use when: "Am I authenticated and what scopes do I have?" -> format="json"`,
      inputSchema: GetServerInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getServerInfoHandler(params, ctx)
  );
}

export type { GetServerInfoInput };
