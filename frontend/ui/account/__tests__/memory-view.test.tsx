import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getAgentMemory: vi.fn(),
  editAgentMemory: vi.fn(),
  forgetAgentMemory: vi.fn(),
  saveAgentMemorySettings: vi.fn(),
  MEMORY_EXPORT_PATH: '/api/account/memory/export',
}));

vi.mock('@/frontend/api/account-memory', () => mocks);

const session = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => session);

import { MemoryView } from '../memory-view';

const FACT = {
  id: 'memory-1',
  scope: 'account' as const,
  product: null,
  threadId: null,
  kind: 'fact' as const,
  text: 'الموعد الشهري في الخامس عشر',
  sourceTurnId: null,
  confidence: 1,
  createdAt: '2026-11-15T09:00:00.000Z',
  updatedAt: '2026-11-15T09:00:00.000Z',
};

const SWITCHES = { account: true, product: true, thread: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAgentMemory.mockResolvedValue({ facts: [FACT], settings: SWITCHES });
  mocks.editAgentMemory.mockResolvedValue(undefined);
  mocks.forgetAgentMemory.mockResolvedValue(undefined);
  mocks.saveAgentMemorySettings.mockResolvedValue(SWITCHES);
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
});

afterEach(cleanup);

describe('MemoryView', () => {
  it('points a guest at sign-in without reading anything', async () => {
    session.useSession.mockReturnValue({ user: null, isLoading: false });
    render(<MemoryView />);

    expect(await screen.findByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Faccount%2Fmemory'
    );
    expect(mocks.getAgentMemory).not.toHaveBeenCalled();
  });

  it('lists every fact with the two controls that act on it', async () => {
    render(<MemoryView />);

    expect(await screen.findByText(FACT.text)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `تعديل: ${FACT.text}` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `انسَ: ${FACT.text}` })).toBeInTheDocument();
  });

  it('says what it does not remember when there are no facts', async () => {
    mocks.getAgentMemory.mockResolvedValue({ facts: [], settings: SWITCHES });
    render(<MemoryView />);

    expect(await screen.findByText('لا أتذكّر شيئاً بعد.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /انسَ:/ })).not.toBeInTheDocument();
  });

  it('removes a fact only after the server accepts the forget', async () => {
    render(<MemoryView />);

    fireEvent.click(await screen.findByRole('button', { name: `انسَ: ${FACT.text}` }));

    await waitFor(() => expect(mocks.forgetAgentMemory).toHaveBeenCalledWith('memory-1'));
    await waitFor(() => expect(screen.queryByText(FACT.text)).not.toBeInTheDocument());
    expect(screen.getByText('لا أتذكّر شيئاً بعد.')).toBeInTheDocument();
  });

  it('keeps the fact and draws the server sentence when the forget is refused', async () => {
    mocks.forgetAgentMemory.mockRejectedValue(new Error('لا يوجد شيء بهذا المعرّف.'));
    render(<MemoryView />);

    fireEvent.click(await screen.findByRole('button', { name: `انسَ: ${FACT.text}` }));

    expect(await screen.findByRole('alert')).toHaveTextContent('لا يوجد شيء بهذا المعرّف.');
    expect(screen.getByText(FACT.text)).toBeInTheDocument();
  });

  it('edits a fact in place and sends only the new text', async () => {
    render(<MemoryView />);

    fireEvent.click(await screen.findByRole('button', { name: `تعديل: ${FACT.text}` }));
    const editor = screen.getByDisplayValue(FACT.text);
    fireEvent.change(editor, { target: { value: 'الموعد صار في العشرين' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ' }));

    await waitFor(() =>
      expect(mocks.editAgentMemory).toHaveBeenCalledWith('memory-1', {
        text: 'الموعد صار في العشرين',
      })
    );
    expect(await screen.findByText('الموعد صار في العشرين')).toBeInTheDocument();
  });

  it('draws one switch over the whole store, off when any scope is closed', async () => {
    render(<MemoryView />);

    expect(await screen.findByRole('switch', { name: 'تشغيل التذكّر' })).not.toBeChecked();
  });

  it('writes every scope together and takes the server answer as the new state', async () => {
    const allOn = { account: true, product: true, thread: true };
    mocks.saveAgentMemorySettings.mockResolvedValue(allOn);
    render(<MemoryView />);

    fireEvent.click(await screen.findByRole('switch', { name: 'تشغيل التذكّر' }));

    await waitFor(() => expect(mocks.saveAgentMemorySettings).toHaveBeenCalledWith(allOn));
    // The page takes the server's three booleans rather than assuming the flip.
    await waitFor(() => expect(screen.getByRole('switch', { name: 'إيقاف التذكّر' })).toBeChecked());
  });

  it('offers the export as a download of the same rows', async () => {
    render(<MemoryView />);

    const link = await screen.findByRole('link', { name: 'تصدير المحفوظات' });
    expect(link).toHaveAttribute('href', '/api/account/memory/export');
    expect(link).toHaveAttribute('download');
  });
});
