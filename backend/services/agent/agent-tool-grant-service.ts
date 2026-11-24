import type { AgentToolGrantRepository } from '@/backend/repositories/agent/agent-tool-grant-repository';
import type { ChatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import { toolIsGrantable } from '@/backend/services/tools/registry';
import { AppError } from '@/backend/shared/errors';
import {
  CHAT_AGENT_TOOLS,
  chatAgentToolIsAdmin,
  type ChatAgentToolName,
} from '@/shared/contracts/chat-agent-actions';
import type { AgentGrantableTool, AgentToolGrant } from '@/shared/contracts/agent-tool-grants';

/**
 * The member's trust in one tool (ADR-0180 decisions 2, 3 and 4, #1438).
 *
 * A grant is tier 1 and nothing else: recording an expense, ticking a habit,
 * changing a display name. Tier 2 can be seen by a third party or moves money,
 * and tier 3 destroys something, so no amount of trust turns either into an
 * automatic call — the executor asks this service for a live grant only after it
 * has read the tool's tier.
 *
 * A grant also needs a run the member has already seen: a member who has never
 * watched the tool work cannot know what they are trusting, so the settings
 * surface offers it only after an applied card exists.
 *
 * The service never creates a grant from a tool's name alone:
 *
 * - the tool must be in the registry, so an unknown id cannot become a row;
 * - its tier must be 1, so a tier-2 or tier-3 tool is refused server-side even
 *   if a caller names it directly;
 * - it must have run once, so the first grant is never blind.
 *
 * Revocation is the member's own row through RLS, and the turn re-reads a live
 * grant before every call it makes, so a revocation stops the next call.
 */
export interface AgentToolGrantServiceDeps {
  grants: AgentToolGrantRepository;
  /** The registry, overridable so a test can pin one tool. */
  tools: () => readonly ChatAgentTool[];
}

const UNKNOWN_TOOL = 'لا توجد أداة بهذا الاسم.';
const NOT_GRANTABLE = 'هذه الأداة لا يمكن منحها: لا بدّ من تأكيدها في كل مرة.';
const NOT_SEEN = 'جرّب الأداة مرة واحدة على الأقل قبل منحها.';
const NOT_FOUND = 'لا توجد أذون بهذا المعرّف.';

export class AgentToolGrantService {
  constructor(private readonly deps: AgentToolGrantServiceDeps) {}

  /** The live grants and the tools the member may grant now. */
  async list(
    userId: string
  ): Promise<{ grants: AgentToolGrant[]; grantable: AgentGrantableTool[] }> {
    const tools = new Map<string, ChatAgentTool>(
      this.deps.tools().map((tool) => [tool.name, tool])
    );
    const live = await this.deps.grants.listLive(userId);
    const grants = live.map((grant) => ({
      ...grant,
      label: toolLabel(tools.get(grant.toolId), grant.toolId),
    }));

    const granted = new Set(grants.map((grant) => grant.toolId));
    const candidates = [...tools.values()].filter(
      (tool) =>
        toolIsGrantable(tool.tier) && !chatAgentToolIsAdmin(tool.name) && !granted.has(tool.name)
    );
    const seen = new Set(
      await this.deps.grants.appliedTools(
        userId,
        candidates.map((tool) => tool.name)
      )
    );
    const grantable = candidates
      .filter((tool) => seen.has(tool.name))
      .map((tool) => ({ toolId: tool.name, label: CHAT_AGENT_TOOLS[tool.name].label }));

    return { grants, grantable };
  }

  /**
   * Create a grant for one tier-1 tool the member has seen run. Calling it twice
   * for a live grant answers the row already there rather than a second one.
   */
  async grant(userId: string, toolId: string, grantedFrom = 'settings'): Promise<AgentToolGrant> {
    const tools = new Map<string, ChatAgentTool>(
      this.deps.tools().map((tool) => [tool.name, tool])
    );
    const tool = tools.get(toolId);
    if (!tool || chatAgentToolIsAdmin(toolId as ChatAgentToolName))
      throw new AppError(UNKNOWN_TOOL, 400);
    if (!toolIsGrantable(tool.tier)) throw new AppError(NOT_GRANTABLE, 403);

    const existing = await this.deps.grants.findLive(userId, toolId);
    if (existing) return { ...existing, label: toolLabel(tool, toolId) };

    const seen = await this.deps.grants.appliedTools(userId, [toolId]);
    if (seen.length === 0) throw new AppError(NOT_SEEN, 403);

    const created = await this.deps.grants.create({ userId, toolId, grantedFrom });
    return { ...created, label: toolLabel(tool, toolId) };
  }

  /** The member's own live grant, or 404. Revoked rows are already absent. */
  async revoke(userId: string, id: string): Promise<void> {
    const revoked = await this.deps.grants.revoke(userId, id, new Date().toISOString());
    if (!revoked) throw new AppError(NOT_FOUND, 404);
  }

  /**
   * The grant the executor may honour for this call, if any. The tier is
   * re-read here, not trusted from the caller: a row that somehow names a tier-2
   * tool still answers null, because a grant never covers one.
   */
  async liveFor(userId: string, toolId: string): Promise<AgentToolGrant | null> {
    const tool = this.deps.tools().find((entry) => entry.name === toolId);
    if (!tool || !toolIsGrantable(tool.tier) || chatAgentToolIsAdmin(toolId as ChatAgentToolName))
      return null;
    return this.deps.grants.findLive(userId, toolId);
  }

  /** Record that a grant caused a run, so the settings surface can date its use. */
  async touch(id: string): Promise<void> {
    await this.deps.grants.touch(id, new Date().toISOString());
  }
}

function toolLabel(tool: ChatAgentTool | undefined, fallback: string): string {
  return tool ? CHAT_AGENT_TOOLS[tool.name].label : fallback;
}
