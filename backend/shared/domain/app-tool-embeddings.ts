import { createHash } from 'node:crypto';

/**
 * What a connected app's tool vector is made of (#1917, ADR-0223).
 *
 * The width is fixed at the deployment's embedding generation
 * (`agent_memory_embeddings_1024`, ADR-0190 decision 2): the same model that
 * embeds a member's message embeds a tool, so the two vectors are comparable.
 * A model of another width cannot be stored here, and the connect flow simply
 * writes nothing rather than storing a vector the reader cannot use.
 *
 * The text is the tool as a sentence a person would say: the app, what the tool
 * is called with its underscores read as spaces, and what the server says it
 * does. The app is part of it because «انشر الموقع» is a Vercel question, and
 * the name is part because `create_deployment` says more than its description.
 * The generator that pins the routing fixture embeds exactly this text, so the
 * test measures what production writes.
 */
export const APP_TOOL_EMBEDDING = {
  table: 'mcp_connection_tool_embeddings_1024',
  nearestFunction: 'mcp_tool_nearest_1024',
  dimensions: 1024,
  /** How many similarities a turn asks for: the router declares at most 16. */
  candidates: 32,
} as const;

/** The text one tool's vector describes. */
export function appToolEmbeddingText(input: {
  appName: string;
  toolName: string;
  description: string | null;
}): string {
  const app = input.appName.trim();
  const name = input.toolName.replace(/_/g, ' ').trim();
  const description = (input.description ?? '').trim();
  return `${app}: ${name}.${description ? ` ${description}` : ''}`;
}

/**
 * The identity of the text above, with the model in it.
 *
 * The model is part of the hash so a deployment that changes its embedding model
 * re-embeds the tool instead of comparing a vector from one space with a vector
 * from another. A description the server rewrote is a different hash for the
 * same reason.
 */
export function appToolEmbeddingHash(model: string, text: string): string {
  return createHash('sha256').update(`${model}\n${text}`).digest('hex');
}
