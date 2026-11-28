import type { ChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import type { VisualRenderRepository } from '@/backend/repositories/chat/visual-render-repository';
import type { VisualRenderer } from '@/backend/services/chat/visual-render';
import { logger } from '@/backend/shared/logger';
import { CHAT_MEDIA_ROUTE, type ChatMedia } from '@/shared/contracts/chat-media';
import { VISUAL_CLIP_READY, VISUAL_UNAVAILABLE } from '@/shared/contracts/visual';

/**
 * Turn a queued motion spec into one assistant message with an MP4 attachment.
 *
 * The turn never waits for this: it stored the spec and drew the still, and a
 * later wake claims the row, renders it, stores the clip in the same private
 * bucket every attachment uses, and writes the follow-up line the thread's
 * Realtime subscription shows. A refusal is the one Arabic sentence, never a
 * broken turn; a transient failure is retried under the lease.
 */

/** Four attempts, matching the schema's `attempts between 0 and 3` ceiling. */
const MAX_ATTEMPTS = 3;

export interface VisualRenderServiceDeps {
  renders: Pick<VisualRenderRepository, 'due' | 'claim' | 'complete' | 'fail'>;
  attachments: Pick<ChatAttachmentStorage, 'upload'>;
  agent: Pick<ChatAgentRepository, 'insertAgentMessage'>;
  render: VisualRenderer;
}

export interface VisualRenderRunResult {
  due: number;
  rendered: number;
  failed: number;
  skipped: number;
}

export class VisualRenderService {
  constructor(private readonly deps: VisualRenderServiceDeps) {}

  async run(limit = 1): Promise<VisualRenderRunResult> {
    const ids = await this.deps.renders.due(limit);
    let rendered = 0;
    let failed = 0;
    let skipped = 0;

    for (const id of ids) {
      let row;
      try {
        row = await this.deps.renders.claim(id);
      } catch (error) {
        logger.warn('Visual render could not be claimed', { render: id, error: String(error) });
        skipped += 1;
        continue;
      }
      if (!row) {
        skipped += 1;
        continue;
      }

      try {
        const outcome = await this.deps.render.render(row.spec);
        if (!outcome.ok) {
          await this.refuse(row, outcome.reason);
          failed += 1;
          continue;
        }

        const storagePath = `${row.conversationId}/rendered/${row.id}-${row.attempts}.mp4`;
        const stored = await this.deps.attachments.upload(
          storagePath,
          outcome.clip.bytes,
          'video/mp4'
        );
        if (!stored) {
          await this.retryOrRefuse(row, 'upload');
          failed += 1;
          continue;
        }

        await this.deps.agent.insertAgentMessage(
          row.conversationId,
          VISUAL_CLIP_READY,
          undefined,
          undefined,
          this.media(row.conversationId, storagePath)
        );
        await this.deps.renders.complete(row.id, storagePath);
        logger.info('Visual render finished', {
          render: row.id,
          frames: outcome.clip.frames,
          bytes: outcome.clip.bytes.byteLength,
          renderMs: outcome.clip.renderMs,
        });
        rendered += 1;
      } catch (error) {
        logger.warn('Visual render failed', { render: row.id, error: String(error) });
        await this.retryOrRefuse(row, error instanceof Error ? error.message : 'render');
        failed += 1;
      }
    }

    return { due: ids.length, rendered, failed, skipped };
  }

  private media(conversationId: string, path: string): ChatMedia {
    const query = new URLSearchParams({ conversationId, path });
    return {
      kind: 'video',
      url: `${CHAT_MEDIA_ROUTE}?${query.toString()}`,
      mimeType: 'video/mp4',
    };
  }

  /** A spec the renderer refuses will never succeed: fail now, say so once. */
  private async refuse(row: { id: string; conversationId: string }, reason: string) {
    await this.deps.renders.fail(row.id, reason).catch((error: unknown) => {
      logger.warn('Visual render could not record its refusal', {
        render: row.id,
        error: String(error),
      });
    });
    await this.sayUnavailable(row.conversationId);
  }

  /** A transient failure is retried under the lease, and said once it is final. */
  private async retryOrRefuse(
    row: { id: string; conversationId: string; attempts: number },
    reason: string
  ) {
    if (row.attempts < MAX_ATTEMPTS) return;
    await this.refuse(row, reason);
  }

  private async sayUnavailable(conversationId: string) {
    await this.deps.agent
      .insertAgentMessage(conversationId, VISUAL_UNAVAILABLE)
      .catch((error: unknown) => {
        logger.warn('Visual render refusal could not reach the thread', {
          conversationId,
          error: String(error),
        });
      });
  }
}
