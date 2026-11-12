import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SubscribePlanSummary } from '../subscribe-plan-summary';

afterEach(cleanup);

describe('SubscribePlanSummary', () => {
  it('opens the card with the page heading, like the other form pages', () => {
    render(<SubscribePlanSummary price="$10" itemCap={50} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'الاشتراك في الخطَّة المدفوعة' })
    ).toBeInTheDocument();
  });

  it('closes the card with a labelled fee, the price, and its period', () => {
    render(<SubscribePlanSummary price="$10" itemCap={50} />);

    expect(screen.getByText('رسوم الاستثمار')).toBeInTheDocument();
    expect(screen.getByText('$10')).toBeInTheDocument();
    expect(screen.getByText('شهريًّا')).toBeInTheDocument();
  });

  it('says what the plan holds, and nothing the page stopped selling', () => {
    render(<SubscribePlanSummary price="$10" itemCap={50} />);

    expect(screen.getByText('حتَّى 50 عنصر من كل خدمة.')).toBeInTheDocument();
    expect(screen.queryByText(/خصم/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تطبيقات/)).not.toBeInTheDocument();
  });
});
