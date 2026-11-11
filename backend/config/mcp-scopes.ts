/**
 * The permissions a connection asks a provider for, reviewed one row at a time
 * (#1230).
 *
 * Absent from this table means "ask for nothing": the provider's own default is
 * the grant, which is what every row did before the table existed. A row nobody
 * measured is never narrowed on a guess.
 *
 * A set is sent in **two** places, because providers disagree about which one
 * they read (measured below): the RFC 7591 registration body, and the RFC 6749
 * authorization URL. A provider that ignores one costs nothing; a provider that
 * reads only the other would otherwise grant its default in silence.
 *
 * Changing a set re-registers the client on the next connect — the registration
 * row records the set it was created for — so the next consent asks for the new
 * one rather than the one the cached client was made with.
 */
interface McpScopeDecision {
  registryName: string;
  /** What the connection will ask for, in the provider's own names. */
  scopes: readonly string[];
  /** The day this was read from the provider, like a pre-registered client. */
  measured: string;
}

const DECISIONS: readonly McpScopeDecision[] = [
  {
    registryName: 'com.supabase/mcp',
    measured: '2026-11-11',
    /*
      Supabase publishes 13 scopes and, on a registration that names none,
      grants all of them — including `secrets:read`, `environment:write` and
      `storage:write`, which no tool in its 36-tool list uses. Measured on
      2026-11-11 with an isolated DCR client:

      - `scope` on the **authorization** URL is ignored: asking for
        `database:read` returned all 13, and a made-up scope was forwarded to the
        consent page unvalidated.
      - `scope` on the **registration** is honoured: registering with
        `database:read projects:read` produced a token carrying exactly those
        two, and refresh kept them.
      - `tools/list` is not filtered by the grant: the two-scope token still saw
        all 36 tools, so a tool can only be found out at its call, which refuses
        with `insufficient_scope` and the permission it needs.

      So the set below is the tools' own capability, not the widest grant: the
      writes stay in (the `ask` level cards them, and a carded write that is
      refused for scope would be a worse experience than the card), and the five
      that no tool uses stay out. `get_publishable_keys` is the one tool this
      costs: it asks for `secrets:read`, refuses with that permission named, and
      the wider consent grants it on purpose.
    */
    scopes: [
      'organizations:read',
      'projects:read',
      'projects:write',
      'database:read',
      'database:write',
      'analytics:read',
      'edge_functions:read',
      'edge_functions:write',
    ],
  },
];

const REQUESTED = new Map<string, readonly string[]>(
  DECISIONS.map(({ registryName, scopes }) => [registryName, scopes])
);

/** The set this catalogue row asks for; `null` means "the provider's default". */
export function requestedScopesFor(registryName: string): readonly string[] | null {
  return REQUESTED.get(registryName) ?? null;
}

/** Every row this table covers, for the spec's own table and its tests. */
export const MCP_SCOPE_DECISIONS: readonly McpScopeDecision[] = DECISIONS;
