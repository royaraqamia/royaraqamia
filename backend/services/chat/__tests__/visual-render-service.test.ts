import { describe, expect, it, vi } from 'vitest';

import { VisualRenderService } from '@/backend/services/chat/visual-render-service';
import type { VisualRenderer } from '@/backend/services/chat/visual-render';
import type { VisualRenderRow } from '@/backend/repositories/chat/visual-render-repository';
import {
  VISUAL_CLIP_READY,
  VISUAL_UNAVAILABLE,
  VisualRenderSpecSchema,
} from '@/shared/contracts/visual';

const svg = '<svg viewBox="0 0 10 10"><rect id="box" width="10" height="10"></rect></svg>';

const spec = VisualRenderSpecSchema.parse({
  svg,
  animation: {
    durationMs: 800,
    fps: 10,
    tracks: [
      {
        id: 'box',
        keyframes: [
          { at: 0, x: 0 },
          { at: 1, x: 50 },
        ],
      },
    ],
  },
});

const clip = {
  bytes: new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]),
  frames: 8,
  durationMs: 800,
  fps: 10,
  width: 640,
  height: 360,
  renderMs: 120,
};

function harness(options: { attempts?: number; render?: VisualRenderer['render'] }) {
  const row: VisualRenderRow = {
    id: 'r1',
    conversationId: 'c1',
    memberId: 'u1',
    spec,
    attempts: options.attempts ?? 1,
  };
  const renders = {
    due: vi.fn(async () => ['r1']),
    claim: vi.fn(async () => row),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  };
  const attachments = { upload: vi.fn(async () => true) };
  const agent = { insertAgentMessage: vi.fn(async () => ({}) as never) };
  const render = vi.fn(options.render ?? (async () => ({ ok: true, clip }) as const));

  const service = new VisualRenderService({
    renders: renders as never,
    attachments: attachments as never,
    agent: agent as never,
    render: { render } as VisualRenderer,
  });

  return { service, renders, attachments, agent, render };
}

describe('visual render service (ADR-0215 amendment)', () => {
  it('stores the clip and writes one assistant message with it', async () => {
    const { service, renders, attachments, agent } = harness({});

    const result = await service.run(1);

    expect(result).toEqual({ due: 1, rendered: 1, failed: 0, skipped: 0 });
    expect(attachments.upload).toHaveBeenCalledWith(
      'c1/rendered/r1-1.mp4',
      clip.bytes,
      'video/mp4'
    );
    expect(agent.insertAgentMessage).toHaveBeenCalledWith(
      'c1',
      VISUAL_CLIP_READY,
      undefined,
      undefined,
      expect.objectContaining({ kind: 'video', mimeType: 'video/mp4' })
    );
    expect(renders.complete).toHaveBeenCalledWith('r1', 'c1/rendered/r1-1.mp4');
    expect(renders.fail).not.toHaveBeenCalled();
  });

  it('turns a refused spec into one Arabic sentence and no clip', async () => {
    const { service, renders, attachments, agent } = harness({
      render: async () => ({ ok: false, reason: 'spec' }),
    });

    await service.run(1);

    expect(renders.fail).toHaveBeenCalledWith('r1', 'spec');
    expect(renders.complete).not.toHaveBeenCalled();
    expect(attachments.upload).not.toHaveBeenCalled();
    expect(agent.insertAgentMessage).toHaveBeenCalledWith('c1', VISUAL_UNAVAILABLE);
  });

  it('retries a transient failure under the lease without speaking yet', async () => {
    const { service, renders, agent } = harness({
      attempts: 1,
      render: async () => {
        throw new Error('ffmpeg died');
      },
    });

    await service.run(1);

    expect(renders.fail).not.toHaveBeenCalled();
    expect(renders.complete).not.toHaveBeenCalled();
    expect(agent.insertAgentMessage).not.toHaveBeenCalled();
  });

  it('speaks once when the last attempt fails', async () => {
    const { service, renders, agent } = harness({
      attempts: 3,
      render: async () => {
        throw new Error('ffmpeg died');
      },
    });

    await service.run(1);

    expect(renders.fail).toHaveBeenCalledWith('r1', 'ffmpeg died');
    expect(agent.insertAgentMessage).toHaveBeenCalledWith('c1', VISUAL_UNAVAILABLE);
  });
});
