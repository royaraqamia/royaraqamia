import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { CODING_PLAN_CAPS } from '@/shared/contracts/coding-agent';
import { CodingCapBanner } from '../coding-cap-banner';

afterEach(cleanup);

describe('the cap banner shown before a run', () => {
  it('shows the pro caps when the plan is known', () => {
    render(<CodingCapBanner plan="pro" />);

    expect(screen.getByText(/حدود خطتك قبل بدء المهمة/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.pro.tasksPerMonth}\\b`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.pro.runnerMinutes}\\b`))
    ).toBeInTheDocument();
    expect(screen.queryByText(/خطتك غير معروفة/)).not.toBeInTheDocument();
  });

  it('shows the free caps when the plan is known to be free', () => {
    render(<CodingCapBanner plan="free" />);

    expect(screen.getByText(/حدود خطتك قبل بدء المهمة/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.free.tasksPerMonth}\\b`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.free.runnerMinutes}\\b`))
    ).toBeInTheDocument();
  });

  it('shows free numbers labelled as such when the plan is unknown', () => {
    render(<CodingCapBanner plan={null} />);

    expect(screen.getByText(/نعرض حدود الخطة المجانية لأن خطتك غير معروفة/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.free.tasksPerMonth}\\b`))
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`\\b${CODING_PLAN_CAPS.free.runnerMinutes}\\b`))
    ).toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp(`\\b${CODING_PLAN_CAPS.pro.tasksPerMonth}\\b`))
    ).not.toBeInTheDocument();
  });

  it('renders only ASCII digits', () => {
    const { container } = render(<CodingCapBanner />);

    expect(container.textContent).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/);
  });
});
