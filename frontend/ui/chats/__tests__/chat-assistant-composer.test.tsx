import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const shrink = vi.hoisted(() => ({ shrinkChatImage: vi.fn() }));
vi.mock('@/frontend/ui/chats/image-downscale', () => shrink);

import { AssistantComposer } from '@/frontend/ui/chats/chat-assistant-composer';
import { ATTACHMENT_REFUSALS } from '@/frontend/ui/chats/attachment-quota';
import type { ChatAttachmentQuota } from '@/shared/contracts/chat';

const QUOTA: ChatAttachmentQuota = {
  fileBytes: 10 * 1024 * 1024,
  today: { usedBytes: 0, limitBytes: 100 * 1024 * 1024 },
  total: { usedBytes: 0, limitBytes: 200 * 1024 * 1024 },
  project: { usedBytes: 0, limitBytes: 500 * 1024 * 1024 },
};

const ASSISTANT = {
  available: true,
  allowance: {
    plan: 'pro' as const,
    member: { used: 1, cap: 40 },
    project: { used: 2, limit: 200 },
    resetsAt: '2026-11-09T00:00:00.000Z',
  },
  isStreaming: false,
  streamingText: '',
  interrupted: '',
  toolsUsed: [],
  error: null,
  ask: vi.fn(async () => true),
  refresh: vi.fn(async () => undefined),
};

function pick(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error('the composer has no file input');
  fireEvent.change(input, { target: { files } });
}

const image = (index: number) =>
  new File([new Uint8Array(16)], `shot-${index}.png`, { type: 'image/png' });

/**
 * The composer's half of ADR-0139: a picture is shrunk before it is staged, and
 * a fourth one is refused with a sentence before anything is decoded or
 * uploaded.
 */
describe('AssistantComposer pictures', () => {
  beforeEach(() => {
    toast.error.mockReset();
    toast.info.mockReset();
    shrink.shrinkChatImage.mockReset();
    shrink.shrinkChatImage.mockImplementation(async (file: File) => file);
  });

  it('shrinks every picked picture before staging it', async () => {
    const { container } = render(
      <AssistantComposer
        assistant={ASSISTANT}
        quota={QUOTA}
        draft=""
        onDraft={() => undefined}
        onAsk={() => undefined}
      />
    );

    const first = image(1);
    const second = image(2);
    pick(container, [first, second]);

    await waitFor(() => expect(shrink.shrinkChatImage).toHaveBeenCalledTimes(2));
    expect(shrink.shrinkChatImage).toHaveBeenCalledWith(first);
    expect(shrink.shrinkChatImage).toHaveBeenCalledWith(second);
    await waitFor(() => expect(screen.getByText('shot-1.png')).toBeInTheDocument());
    expect(screen.getByText('shot-2.png')).toBeInTheDocument();
  });

  it('refuses a fourth picture without decoding or uploading it', async () => {
    const { container } = render(
      <AssistantComposer
        assistant={ASSISTANT}
        quota={QUOTA}
        draft=""
        onDraft={() => undefined}
        onAsk={() => undefined}
      />
    );

    pick(container, [image(1), image(2), image(3)]);
    await waitFor(() => expect(screen.getByText('shot-3.png')).toBeInTheDocument());

    pick(container, [image(4)]);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(ATTACHMENT_REFUSALS.tooManyImages, {
        id: 'assistant-composer-attachment',
      })
    );
    // Three decodes, not four: the refusal happens before the work.
    expect(shrink.shrinkChatImage).toHaveBeenCalledTimes(3);
    expect(screen.queryByText('shot-4.png')).toBeNull();
  });
});
