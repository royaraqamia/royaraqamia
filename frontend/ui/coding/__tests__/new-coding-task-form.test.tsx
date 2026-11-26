import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { CodingWorkspaceDto } from '@/shared/contracts/coding-agent';

const mocks = vi.hoisted(() => ({
  createCodingTask: vi.fn(),
}));

vi.mock('@/frontend/api/coding', () => mocks);

import { NewCodingTaskForm } from '../new-coding-task-form';

const WORKSPACE: CodingWorkspaceDto = {
  id: '5f0a3c1e-6a2b-4c7d-8e9f-0a1b2c3d4e5f',
  repoOwner: 'royaraqamia',
  repoName: 'royaraqamia',
  defaultBranch: 'develop',
  bootstrapPrUrl: null,
  createdAt: '2026-11-20T08:00:00.000Z',
};

const assign = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
});

afterEach(cleanup);

/**
 * The form renders before the parent's repository read resolves (#1888), so the
 * selection and the branch are read from the parent's list, not from state
 * captured on the first render. Both tests rerender exactly as the parent does.
 */
describe('the new coding task form', () => {
  it('creates the task for the repository that arrives after the first render', async () => {
    mocks.createCodingTask.mockResolvedValue({ id: 'task-9' });

    const { rerender } = render(<NewCodingTaskForm workspaces={[]} />);
    expect(screen.getByText('اربط مستودعًا أولًا لتبدأ مهمة جديدة.')).toBeInTheDocument();

    rerender(<NewCodingTaskForm workspaces={[WORKSPACE]} />);

    // The regression: the branch stayed at the hardcoded `main` because the
    // initial state was read while the list was still empty.
    expect(screen.getByLabelText('الفرع الأساسي')).toHaveValue('develop');

    fireEvent.change(screen.getByLabelText('العنوان'), { target: { value: 'إصلاح الزر' } });
    fireEvent.change(screen.getByLabelText('ما تريد تنفيذه'), {
      target: { value: 'أضف اختبارًا يغطي النموذج.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بدء المهمة' }));

    await waitFor(() =>
      expect(mocks.createCodingTask).toHaveBeenCalledWith({
        workspaceId: WORKSPACE.id,
        title: 'إصلاح الزر',
        instruction: 'أضف اختبارًا يغطي النموذج.',
        mode: 'plan',
        baseBranch: 'develop',
      })
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/coding/task-9'));
  });

  it('shows the refusal sentence and offers the button again', async () => {
    mocks.createCodingTask.mockRejectedValue(new Error('تجاوزت حدّ المهام الشهرية في خطتك.'));

    render(<NewCodingTaskForm workspaces={[WORKSPACE]} />);
    fireEvent.change(screen.getByLabelText('العنوان'), { target: { value: 'إصلاح الزر' } });
    fireEvent.change(screen.getByLabelText('ما تريد تنفيذه'), { target: { value: 'نفّذ' } });
    fireEvent.click(screen.getByRole('button', { name: 'بدء المهمة' }));

    expect(await screen.findByText('تجاوزت حدّ المهام الشهرية في خطتك.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بدء المهمة' })).toBeEnabled();
    expect(assign).not.toHaveBeenCalled();
  });
});
