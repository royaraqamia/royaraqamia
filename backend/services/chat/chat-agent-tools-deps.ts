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
import type { resolveOrigin } from '@/backend/config/origin';

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
  /** The public address this server answers on, for a short link's card. */
  origin: typeof resolveOrigin;
}
