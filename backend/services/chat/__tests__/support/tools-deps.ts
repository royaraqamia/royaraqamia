import type { ChatAgentToolsDeps } from '@/backend/services/chat/chat-agent-tools-deps';

const unwired = (): never => {
  throw new Error('Tool dependency was not wired in this test');
};

type GroupOverrides = {
  [K in keyof ChatAgentToolsDeps]?: Partial<ChatAgentToolsDeps[K]>;
};

/**
 * A complete bundle of factories for a tool test. The catalogue no longer
 * imports the container (#1804), so a test hands it the fakes it wants to
 * exercise; a group the test does not override fails loudly if a tool calls it.
 */
export function toolsDepsFor(overrides: GroupOverrides = {}): ChatAgentToolsDeps {
  const deps: ChatAgentToolsDeps = {
    certificates: { createRepository: unwired, verifyByCode: unwired },
    posts: { createRepository: unwired, createService: unwired },
    habits: { createService: unwired },
    spendtrack: { createService: unwired },
    consultation: { createService: unwired },
    training: { createApplicationService: unwired, createCohortsRepository: unwired },
    projectRequests: { createService: unwired },
    users: { createAdminService: unwired, createProfileService: unwired },
    mcp: {
      createAppToolsService: unwired,
      createCatalogService: unwired,
      createConnectService: unwired,
      createConnectionService: unwired,
      createConnectedAppService: unwired,
      callbackUrl: unwired,
    },
    chatReports: { createAdminService: unwired },
    plans: { createUsageService: unwired, createPlanGate: unwired },
    notes: { createService: unwired },
    memory: { createFor: unwired },
    news: { createServiceFor: unwired, createPreferencesServiceFor: unwired },
    rates: { createService: unwired },
    scanHistory: { createService: unwired },
    quran: { createService: unwired },
    origin: unwired,
  };
  for (const [group, value] of Object.entries(overrides)) {
    const current = deps[group as keyof ChatAgentToolsDeps];
    if (value === undefined) continue;
    if (typeof current === 'function') {
      // A scalar field such as `origin` replaces the default; a group merges.
      (deps as unknown as Record<string, unknown>)[group] = value;
    } else if (current && typeof current === 'object') {
      Object.assign(current, value);
    }
  }
  return deps;
}
