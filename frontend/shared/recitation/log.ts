import { logger } from '@/frontend/shared/logger';

/**
 * One line for a recitation failure the reader cannot act on — a download that
 * failed, a keep that was refused. Kept apart from the engine so the app shell
 * can log one without pulling the player and its audio stack into every route's
 * first bundle.
 */
export function logRecitationFailure(message: string, error: unknown): void {
  logger.error(message, { reason: error instanceof Error ? error.message : String(error) });
}
