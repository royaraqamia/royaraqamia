import type {
  createCertificatesRepository,
  verifyCertificateByCode,
} from '@/backend/config/certificates';
import type { createPostsRepository } from '@/backend/config/blogpress';
import type { createHabitService } from '@/backend/config/habitflow';
import type { createSpendtrackService } from '@/backend/config/spendtrack';
import type { createPublicConsultationService } from '@/backend/config/consultation';
import type {
  createDefaultTrainingApplicationService,
  createDefaultTrainingCohortsRepository,
} from '@/backend/config/training';
import type { createDefaultProjectRequestService } from '@/backend/config/project-requests';
import type { createAdminUsersService, createProfileService } from '@/backend/config/users';
import type {
  createDefaultMcpAppToolsService,
  createDefaultMcpCatalogService,
  createDefaultMcpConnectService,
  createDefaultMcpConnectionService,
  createDefaultMcpConnectedAppService,
  mcpCallbackUrl,
} from '@/backend/config/mcp';
import type { createDefaultChatReportsAdminService } from '@/backend/config/chat-reports';
import type { createUsageService, createPlanGate } from '@/backend/config/plans';
import type { createNotesService } from '@/backend/config/notes';
import type { createAgentMemoryFor } from '@/backend/config/agent-memory';
import type { createNewsPreferencesServiceFor, createNewsServiceFor } from '@/backend/config/news';
import type { createRatesService } from '@/backend/config/rates';
import type { createScanHistoryService } from '@/backend/config/scan-history';
import type { createQuranSyncService } from '@/backend/config/quran';
import type { resolveOrigin } from '@/backend/config/origin';
import type {
  CodingTaskDto,
  CodingTaskPage,
  CodingTaskListQuery,
  CreateCodingTaskInput,
  DecideCodingStepInput,
} from '@/shared/contracts/coding-agent';

/**
 * The coding agent's control plane (ADR-0219). The chat service holds none of
 * its execution primitives: these five hands only start a task, read its state
 * and diffs, and carry a member's decision on one step. `userId` is always the
 * caller's, injected by the turn, never a tool argument.
 *
 * The bundle is absent when the deployment has no GitHub App configured; the
 * tools stay declared and answer with a refusal instead of failing the turn.
 */
export interface CodingToolsDeps {
  createTask(userId: string, input: CreateCodingTaskInput): Promise<CodingTaskDto>;
  getTask(userId: string, taskId: string): Promise<CodingTaskDto>;
  listTasks(userId: string, query: CodingTaskListQuery): Promise<CodingTaskPage>;
  decideStep(
    userId: string,
    taskId: string,
    stepId: string,
    decision: DecideCodingStepInput
  ): Promise<CodingTaskDto>;
}

/**
 * The product services the assistant's tools reach, assembled once by the
 * container (`backend/config/chat.ts`) and handed to the turn.
 *
 * A tool used to import the factories itself and choose its client at each
 * call site — a second composition root inside the service layer. The bundle
 * makes that choice in one place and lets a test hand the catalogue a fake
 * instead of mocking the wiring module. The fields are the factories, not
 * instances: most are bound to the member's own client, which the tool knows
 * and the container does not.
 */
export interface ChatAgentToolsDeps {
  certificates: {
    createRepository: typeof createCertificatesRepository;
    verifyByCode: typeof verifyCertificateByCode;
  };
  posts: {
    createRepository: typeof createPostsRepository;
  };
  habits: {
    createService: typeof createHabitService;
  };
  spendtrack: {
    createService: typeof createSpendtrackService;
  };
  consultation: {
    createService: typeof createPublicConsultationService;
  };
  training: {
    createApplicationService: typeof createDefaultTrainingApplicationService;
    createCohortsRepository: typeof createDefaultTrainingCohortsRepository;
  };
  projectRequests: {
    createService: typeof createDefaultProjectRequestService;
  };
  users: {
    createAdminService: typeof createAdminUsersService;
    createProfileService: typeof createProfileService;
  };
  mcp: {
    createAppToolsService: typeof createDefaultMcpAppToolsService;
    createCatalogService: typeof createDefaultMcpCatalogService;
    createConnectService: typeof createDefaultMcpConnectService;
    createConnectionService: typeof createDefaultMcpConnectionService;
    createConnectedAppService: typeof createDefaultMcpConnectedAppService;
    callbackUrl: typeof mcpCallbackUrl;
  };
  chatReports: {
    createAdminService: typeof createDefaultChatReportsAdminService;
  };
  plans: {
    createUsageService: typeof createUsageService;
    createPlanGate: typeof createPlanGate;
  };
  notes: {
    createService: typeof createNotesService;
  };
  memory: {
    createFor: typeof createAgentMemoryFor;
  };
  news: {
    createServiceFor: typeof createNewsServiceFor;
    createPreferencesServiceFor: typeof createNewsPreferencesServiceFor;
  };
  rates: {
    createService: typeof createRatesService;
  };
  scanHistory: {
    createService: typeof createScanHistoryService;
  };
  /**
   * The Quran's server-side records (#1918). The reader's own position and
   * bookmarks are the fact the opening reads before it offers the reader; the
   * assistant's Quran tools call the page's own engine instead.
   */
  quran: {
    createService: typeof createQuranSyncService;
  };
  /** The public address this server answers on, for a short link's card. */
  origin: typeof resolveOrigin;
  /** The coding agent, only when this deployment has a GitHub App (ADR-0219). */
  coding?: CodingToolsDeps;
}
