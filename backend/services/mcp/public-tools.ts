import { MCP_SERVER_NAME } from './constants';

/**
 * Tools callable by anonymous (tokenless) callers — the public face of the
 * MCP server (ADR 0021). Everything not listed here requires a completed
 * OAuth flow: an anonymous caller requesting one is answered with a 401
 * Bearer challenge that lets the MCP client start its authorization flow.
 *
 * Dual-mode tools (e.g. `community_get_post`) are listed because they have
 * an anonymous code path; their internal guards still constrain what an
 * anonymous caller may see, and RLS is the second line of defense.
 */
export const PUBLIC_TOOL_NAMES: ReadonlySet<string> = new Set([
  `${MCP_SERVER_NAME}_server_info`,
  `${MCP_SERVER_NAME}_certificates_verify`,
  `${MCP_SERVER_NAME}_community_list_posts`,
  `${MCP_SERVER_NAME}_community_get_post`,
  `${MCP_SERVER_NAME}_community_list_categories`,
  `${MCP_SERVER_NAME}_community_list_tags`,
]);
