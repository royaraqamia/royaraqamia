import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { CODING_TASK_STATUSES } from '@/shared/contracts/coding-agent';
import { CODING_TASK_STATUS_LABELS, isCodingTaskActive } from '../coding-labels';
import { CodingStatusLabel } from '../coding-status-label';

afterEach(cleanup);

describe('coding task status labels', () => {
  it('names every wire status in Arabic', () => {
    const { container } = render(
      <div>
        {CODING_TASK_STATUSES.map((status) => (
          <CodingStatusLabel key={status} status={status} />
        ))}
      </div>
    );

    for (const label of Object.values(CODING_TASK_STATUS_LABELS)) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(container.querySelectorAll('span')).toHaveLength(CODING_TASK_STATUSES.length);
  });

  it('never paints the machine token as the label', () => {
    render(<CodingStatusLabel status="awaiting_push" />);

    expect(screen.getByText('بانتظار الموافقة على النشر')).toBeInTheDocument();
    expect(screen.queryByText('awaiting_push')).not.toBeInTheDocument();
  });

  it('counts only the four states that can still move as active', () => {
    expect(CODING_TASK_STATUSES.filter(isCodingTaskActive)).toEqual([
      'queued',
      'running',
      'awaiting_plan',
      'awaiting_push',
    ]);
  });
});
