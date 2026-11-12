import { z } from 'zod';

import {
  McpAuthModeSchema,
  McpCatalogConnectReasonSchema,
  McpCatalogCoverageSchema,
  McpCatalogWaitReasonSchema,
} from '@/shared/contracts/mcp-catalog';

/**
 * The scoped door an unattended run writes the catalogue through (#1293).
 *
 * The agent token may hand out candidates and apply five acts — mark, copy,
 * verify, withdraw, skip — and nothing else. It cannot block, delete, change a
 * remote, or read a member's connections, because there is no verb for any of
 * them: the capability is the enum, not a role.
 */

/** The actor every event this door writes carries. */
export const MCP_CATALOG_AGENT_ACTOR = 'agent:mcp-catalog';

/** The most candidates one call hands out; the job's own cap is smaller. */
export const MCP_CATALOG_AGENT_MAX_CANDIDATES = 20;

/** Why a row waits for a person. A category, so the console can count it. */
export const McpCatalogAgentSkipReasonSchema = McpCatalogWaitReasonSchema;

export type McpCatalogAgentSkipReason = z.infer<typeof McpCatalogAgentSkipReasonSchema>;

/** The checks a publish may rest on. The service requires the ones its class needs. */
export const McpCatalogAgentCheckNameSchema = z.enum([
  /** The catalogue probe read RFC 9728 metadata and found the row connectable. */
  'probe',
  /** RFC 7591 registration answered with a client. */
  'registration',
  /** A reviewed client's authorize endpoint accepted our id and redirect URI. */
  'authorize',
  /** The MCP handshake answered without a token, which is what a no-auth row claims. */
  'tools',
  /** The store's admission still holds: not blocked, not retired. */
  'admission',
]);

export type McpCatalogAgentCheckName = z.infer<typeof McpCatalogAgentCheckNameSchema>;

export const McpCatalogAgentCheckSchema = z.object({
  name: McpCatalogAgentCheckNameSchema,
  ok: z.boolean(),
  /** The measured detail: a status code, an error code, or a short sentence. */
  detail: z.string().max(300).nullable().default(null),
});

export type McpCatalogAgentCheck = z.infer<typeof McpCatalogAgentCheckSchema>;

/**
 * One row the run may work on, as the endpoint hands it out.
 *
 * The registry text travels with it so the agent step normalises and translates
 * what the publisher wrote rather than inventing a description. The static
 * client, when there is one, travels as its public half: `client_id`, the
 * authorize endpoint and the redirect URI already registered with the provider.
 */
export const McpCatalogAgentCandidateSchema = z.object({
  registryName: z.string().min(1),
  title: z.string().nullable(),
  description: z.string().nullable(),
  titleOverride: z.string().nullable(),
  nameAr: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  /** The address the probe measures and the connect flow opens. */
  remoteUrl: z.string(),
  /** The callback URI already registered with every reviewed client. */
  redirectUri: z.string(),
  /** The mark the row draws now, if it has one. */
  iconUrl: z.string().nullable(),
  verified: z.boolean(),
  /** The mode the row carries, so the run measures it the way the store will (#1269). */
  authMode: McpAuthModeSchema,
  connectable: z.boolean().nullable(),
  connectableReason: McpCatalogConnectReasonSchema.nullable(),
  probedAt: z.string().nullable(),
  staticClient: z
    .object({
      authorizationEndpoint: z.string(),
      clientId: z.string(),
    })
    .nullable(),
});

export type McpCatalogAgentCandidate = z.infer<typeof McpCatalogAgentCandidateSchema>;

export const McpCatalogAgentPageSchema = z.object({
  candidates: z.array(McpCatalogAgentCandidateSchema),
  /** Store-wide counts, so the run summary and the console say the same thing. */
  coverage: McpCatalogCoverageSchema,
});

export type McpCatalogAgentPage = z.infer<typeof McpCatalogAgentPageSchema>;

/**
 * A mark the agent may write. The three allowed sources, in precedence, and a
 * `/brand/...` path for a mark that ships with the site instead of a URL.
 */
export const McpCatalogAgentMarkActionSchema = z.object({
  action: z.literal('mark'),
  registryName: z.string().trim().min(1).max(200),
  /** A `/brand/...` path or an https URL; the service holds it to the same rule. */
  mark: z.string().trim().min(1).max(2048),
  source: z.enum(['logo_uri', 'brand', 'simple_icons', 'repo']),
});

/**
 * A copy is a normalisation and a translation of the registry's own text. The
 * source text travels with the write so the endpoint can refuse a copy that
 * claims a description the mirror does not hold.
 */
export const McpCatalogAgentCopyActionSchema = z.object({
  action: z.literal('copy'),
  registryName: z.string().trim().min(1).max(200),
  titleOverride: z.string().trim().max(120).nullable().optional(),
  nameAr: z.string().trim().max(120).nullable().optional(),
  descriptionAr: z.string().trim().max(1000).nullable().optional(),
  source: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
  }),
});

/** The class whose checks justify a publish. */
export const McpCatalogAgentPublishClassSchema = z.enum(['dcr', 'pre_registered', 'no_auth']);

export type McpCatalogAgentPublishClass = z.infer<typeof McpCatalogAgentPublishClassSchema>;

export const McpCatalogAgentVerifyActionSchema = z.object({
  action: z.literal('verify'),
  registryName: z.string().trim().min(1).max(200),
  class: McpCatalogAgentPublishClassSchema,
  checks: z.array(McpCatalogAgentCheckSchema).min(1).max(12),
  /**
   * What the run's probe measured, written beside the verdict (#1269). Optional
   * so a run that did not measure a mode leaves the stored one alone instead of
   * erasing it.
   */
  probeAuthMode: McpAuthModeSchema.nullable().optional(),
});

export const McpCatalogAgentWithdrawActionSchema = z.object({
  action: z.literal('withdraw'),
  registryName: z.string().trim().min(1).max(200),
  /** The check that failed, so the store can say what took the row out. */
  failedCheck: McpCatalogAgentCheckNameSchema,
  detail: z.string().max(300).nullable().default(null),
});

export const McpCatalogAgentSkipActionSchema = z.object({
  action: z.literal('skip'),
  registryName: z.string().trim().min(1).max(200),
  reason: McpCatalogAgentSkipReasonSchema,
  detail: z.string().max(300).nullable().default(null),
});

export const McpCatalogAgentActionSchema = z.discriminatedUnion('action', [
  McpCatalogAgentMarkActionSchema,
  McpCatalogAgentCopyActionSchema,
  McpCatalogAgentVerifyActionSchema,
  McpCatalogAgentWithdrawActionSchema,
  McpCatalogAgentSkipActionSchema,
]);

export type McpCatalogAgentAction = z.infer<typeof McpCatalogAgentActionSchema>;

export const McpCatalogAgentRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list'),
    limit: z.number().int().min(1).max(MCP_CATALOG_AGENT_MAX_CANDIDATES).default(10),
  }),
  McpCatalogAgentMarkActionSchema,
  McpCatalogAgentCopyActionSchema,
  McpCatalogAgentVerifyActionSchema,
  McpCatalogAgentWithdrawActionSchema,
  McpCatalogAgentSkipActionSchema,
]);

export type McpCatalogAgentRequest = z.infer<typeof McpCatalogAgentRequestSchema>;

/** The pair of checks each publishable class must bring, and all of them `ok`. */
export const MCP_CATALOG_AGENT_REQUIRED_CHECKS: Record<
  McpCatalogAgentPublishClass,
  readonly McpCatalogAgentCheckName[]
> = {
  dcr: ['probe', 'registration', 'admission'],
  pre_registered: ['probe', 'authorize', 'admission'],
  no_auth: ['probe', 'tools', 'admission'],
};
