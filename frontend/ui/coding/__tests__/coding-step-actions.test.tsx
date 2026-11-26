import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CodingTaskWithUsage } from '@/frontend/api/coding';

const mocks = vi.hoisted(() => ({
  getCodingTask: vi.fn(),
  decideCodingStep: vi.fn(),
}));

vi.mock('@/frontend/api/coding', () => mocks);

import { CodingTaskDetail } from '../coding-task-detail';

const PROPOSED_TASK: CodingTaskWithUsage = {
  id: 'task-1',
  workspaceId: 'workspace-1',
  title: 'إصلاح البحث',
  instruction: 'أصلح ترتيب نتائج البحث',
  mode: 'plan',
  status: 'awaiting_plan',
  branch: 'coding/search-1',
  pullRequestUrl: null,
  repos: [],
  summary: 'اقتراح خطة وفرق',
  failureCode: null,
  inputTokens: 1234,
  outputTokens: 56,
  createdAt: '2026-11-25T10:00:00.000Z',
  updatedAt: '2026-11-25T10:00:00.000Z',
  steps: [
    {
      id: 'step-1',
      kind: 'plan',
      status: 'proposed',
      summary: 'تغيير ترتيب النتائج',
      diff: '- old\n+ new',
      repo: null,
      model: null,
      latencyMs: null,
      costUsd: null,
      createdAt: '2026-11-25T10:00:00.000Z',
      inputTokens: 1234,
      outputTokens: 56,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCodingTask.mockResolvedValue(PROPOSED_TASK);
  mocks.decideCodingStep.mockResolvedValue({ success: true });
});

afterEach(cleanup);

describe('a proposed step', () => {
  it('shows its diff and usage, and sends an approval with both ids', async () => {
    render(<CodingTaskDetail taskId="task-1" />);

    expect(await screen.findByText(/\+ new/)).toBeInTheDocument();
    expect(screen.getByText(/^الرموز المستخدمة في المهمة: 1,234 \/ 56$/)).toBeInTheDocument();
    expect(screen.getByText(/^الرموز المستخدمة: 1,234 \/ 56$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'موافقة' }));

    await waitFor(() =>
      expect(mocks.decideCodingStep).toHaveBeenCalledWith('task-1', 'step-1', 'approve')
    );
  });

  it('sends a rejection with the same ids', async () => {
    render(<CodingTaskDetail taskId="task-1" />);

    const reject = await screen.findByRole('button', { name: 'رفض' });
    fireEvent.click(reject);

    await waitFor(() =>
      expect(mocks.decideCodingStep).toHaveBeenCalledWith('task-1', 'step-1', 'reject')
    );
  });

  it('offers no decision once the step has been applied', async () => {
    mocks.getCodingTask.mockResolvedValue({
      ...PROPOSED_TASK,
      status: 'running',
      steps: [{ ...PROPOSED_TASK.steps[0]!, status: 'applied' }],
    });

    render(<CodingTaskDetail taskId="task-1" />);

    expect(await screen.findByText('مطبَّق')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'موافقة' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'رفض' })).not.toBeInTheDocument();
  });
});
