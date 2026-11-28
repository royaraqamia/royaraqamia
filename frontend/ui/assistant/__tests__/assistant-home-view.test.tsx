import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getAssistantIdentity: vi.fn(),
  saveAssistantIdentity: vi.fn(),
  uploadAssistantAvatar: vi.fn(),
  removeAssistantAvatar: vi.fn(),
  writeAssistantSnapshot: vi.fn(),
  // One stable object: a fresh `user` per render would re-run the load effect
  // and repaint the server's identity over every save the test just made.
  session: { user: { id: 'u-1' }, isLoading: false },
  localIdentity: { userId: 'u-1' },
}));

vi.mock('@/frontend/api/assistant-identity', () => ({
  getAssistantIdentity: () => mocks.getAssistantIdentity(),
  saveAssistantIdentity: (...args: unknown[]) => mocks.saveAssistantIdentity(...args),
  uploadAssistantAvatar: (...args: unknown[]) => mocks.uploadAssistantAvatar(...args),
  removeAssistantAvatar: () => mocks.removeAssistantAvatar(),
}));

vi.mock('@/frontend/api/chats/assistant-cache', () => ({
  writeAssistantSnapshot: (...args: unknown[]) => mocks.writeAssistantSnapshot(...args),
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/use-local-identity', () => ({
  useLocalIdentity: () => ({ identity: mocks.localIdentity }),
}));

vi.mock('@/frontend/ui/assistant/grants-view', () => ({
  AssistantGrantsView: () => null,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AssistantHomeView } from '../assistant-home-view';

const IDENTITY = {
  name: 'نور',
  customName: null,
  avatarVariant: null,
  avatarUrl: null,
  voice: 'feminine' as const,
  tone: 'default' as const,
  note: null,
  updatedAt: '2026-11-27T10:00:00.000Z',
};

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAssistantIdentity.mockResolvedValue({ success: true, identity: IDENTITY });
  mocks.saveAssistantIdentity.mockResolvedValue({
    success: true,
    identity: { ...IDENTITY, name: 'حكيم', customName: 'حكيم', voice: 'masculine' },
  });
  mocks.uploadAssistantAvatar.mockResolvedValue({
    success: true,
    identity: { ...IDENTITY, avatarUrl: 'https://cdn.test/avatars/u-1/new.png' },
  });
  mocks.removeAssistantAvatar.mockResolvedValue({ success: true, identity: IDENTITY });
});

describe('/assistant identity editing (ADR-0228)', () => {
  it('edits the name and the voice from the pen beside the header name', async () => {
    render(<AssistantHomeView />);

    await screen.findByRole('heading', { name: 'نور' });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل الاسم' }));

    fireEvent.change(screen.getByRole('textbox', { name: 'الاسم' }), {
      target: { value: 'حكيم' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'مذكر' }));
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() =>
      expect(mocks.saveAssistantIdentity).toHaveBeenCalledWith({
        name: 'حكيم',
        avatarVariant: null,
        voice: 'masculine',
        tone: 'default',
        note: null,
      })
    );
    expect(mocks.writeAssistantSnapshot).toHaveBeenCalledWith(expect.anything(), { name: 'حكيم' });
    await screen.findByRole('heading', { name: 'حكيم' });
  });

  it('sends null when the member clears the name back to the default', async () => {
    render(<AssistantHomeView />);

    await screen.findByRole('heading', { name: 'نور' });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل الاسم' }));
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() =>
      expect(mocks.saveAssistantIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ name: null })
      )
    );
  });

  it('refuses a reserved name in the dialog before the API is called', async () => {
    render(<AssistantHomeView />);

    await screen.findByRole('heading', { name: 'نور' });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل الاسم' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'الاسم' }), {
      target: { value: 'رؤية' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('هذا الاسم محجوز');
    expect(mocks.saveAssistantIdentity).not.toHaveBeenCalled();
  });

  it('uploads a face from the camera badge and shows it with the orb gone', async () => {
    const { container } = render(<AssistantHomeView />);

    await screen.findByRole('heading', { name: 'نور' });
    fireEvent.click(screen.getByRole('button', { name: 'إضافة صُورة' }));

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const file = new File([new Uint8Array(2)], 'face.png', { type: 'image/png' });
    fireEvent.change(fileInput!, { target: { files: [file] } });

    await waitFor(() => expect(mocks.uploadAssistantAvatar).toHaveBeenCalledWith(file));
    await screen.findByRole('button', { name: 'تعديل أو حذف الصُّورة' });
  });

  it('removes the face back to the orb after the confirmation', async () => {
    mocks.getAssistantIdentity.mockResolvedValue({
      success: true,
      identity: { ...IDENTITY, avatarUrl: 'https://cdn.test/avatars/u-1/old.png' },
    });
    render(<AssistantHomeView />);

    await screen.findByRole('button', { name: 'تعديل أو حذف الصُّورة' });
    fireEvent.click(screen.getByRole('button', { name: 'تعديل أو حذف الصُّورة' }));
    fireEvent.click(await screen.findByRole('button', { name: /حذف الصُّورة/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^حذف$/ }));

    await waitFor(() => expect(mocks.removeAssistantAvatar).toHaveBeenCalledTimes(1));
    await screen.findByRole('button', { name: 'إضافة صُورة' });
  });
});

describe('/assistant sections', () => {
  /**
   * The page is the index of what the assistant owns, not a second settings
   * site: the rows that remain are memory and coding, and connected apps were
   * removed from it — the apps sheet is that door (ADR-0159).
   */
  it('links memory and coding, and no longer lists connected apps', async () => {
    render(<AssistantHomeView />);

    expect(await screen.findByRole('link', { name: /ما يتذكّره/ })).toHaveAttribute(
      'href',
      '/account/memory'
    );
    expect(screen.getByRole('link', { name: /مهام البرمجة/ })).toHaveAttribute('href', '/coding');
    expect(screen.queryByRole('link', { name: /تطبيقاته/ })).toBeNull();
  });
});
