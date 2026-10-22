import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PlanCatalog } from '@/shared/contracts/plans';

vi.mock('@/frontend/ui/plans/current-plan-notice', () => ({
  CurrentPlanNotice: () => null,
}));

vi.mock('@/frontend/shared/constants', () => ({
  getWhatsAppUrl: (message: string) => `https://wa.me/100?text=${encodeURIComponent(message)}`,
}));

import { PricingView } from '../pricing-view';

/**
 * A catalog that matches nothing in the seeded migration, so a number showing
 * up here proves the page reads the catalog instead of its own copy.
 */
const catalog: PlanCatalog = {
  settings: {
    priceCents: 1200,
    currency: 'USD',
    durationDays: 30,
    windowDays: 30,
    freeCredits: 250,
    proCredits: 5000,
    anonymousDailyCredits: 7,
  },
  limits: [
    { key: 'habits', label: 'العادات', freeCap: 7, proCap: 77, sortOrder: 10 },
    { key: 'short_links', label: 'الروابط المختصرة', freeCap: 9, proCap: 99, sortOrder: 20 },
    {
      key: 'community_published',
      label: 'المنشورات المنشورة',
      freeCap: 4,
      proCap: 44,
      sortOrder: 30,
    },
    { key: 'quran_bookmarks', label: 'علامات القرآن', freeCap: 6, proCap: 66, sortOrder: 40 },
    {
      key: 'mcp_connected_apps',
      label: 'تطبيقات MCP المتصلة',
      freeCap: 2,
      proCap: 22,
      sortOrder: 50,
    },
  ],
  costs: [
    { actionKey: 'community.post.publish', label: 'نشر منشور', cost: 25, sortOrder: 10 },
    { actionKey: 'linksnap.link.create', label: 'إنشاء رابط مختصر', cost: 2, sortOrder: 20 },
    { actionKey: 'downloader.job.create', label: 'طلب تنزيل وسائط', cost: 10, sortOrder: 30 },
  ],
};

afterEach(cleanup);

describe('PricingView', () => {
  it('renders every number from the catalog', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('250')).toBeInTheDocument();
    expect(screen.getByText('5,000')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();

    // Caps and action costs come from the same rows, grouped as ASCII digits.
    expect(screen.getByText('77')).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
    expect(screen.getByText('25 رصيد')).toBeInTheDocument();

    // The visitor allowance is named for the guest reading the page.
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });

  it('offers the paid plan through WhatsApp with the price in the message', () => {
    render(<PricingView catalog={catalog} />);

    const subscribe = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('wa.me'));

    expect(subscribe.length).toBeGreaterThan(0);
    expect(subscribe[0]?.getAttribute('href')).toContain(encodeURIComponent('$12'));
  });

  it('keeps the comparison honest about reads and saved data', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText(/القراءة دائماً مجانية/)).toBeInTheDocument();
    expect(screen.getByText(/البيانات المحفوظة لا تُحذف/)).toBeInTheDocument();
  });
});
