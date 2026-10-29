import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { PlanCatalog, UsageState } from '@/shared/contracts/plans';

const mocks = vi.hoisted(() => ({
  session: { user: null as { id: string } | null, isLoading: false },
  usage: { state: null as UsageState | null, loading: false, failed: false, reload: vi.fn() },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  useMyUsage: () => mocks.usage,
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
  },
  limits: [
    { key: 'habits', label: 'العادات', visitorCap: 1, freeCap: 7, proCap: 77, sortOrder: 10 },
    { key: 'expenses', label: 'المصروفات', visitorCap: 1, freeCap: 2, proCap: 22, sortOrder: 20 },
    { key: 'budgets', label: 'الميزانيات', visitorCap: 1, freeCap: 1, proCap: 11, sortOrder: 30 },
    {
      key: 'short_links',
      label: 'الروابط المختصرة',
      visitorCap: 1,
      freeCap: 9,
      proCap: 99,
      sortOrder: 40,
    },
    {
      key: 'community_published',
      label: 'المنشورات المنشورة',
      visitorCap: 0,
      freeCap: 4,
      proCap: 44,
      sortOrder: 50,
    },
    {
      key: 'community_drafts',
      label: 'مسودات المنشورات',
      visitorCap: 0,
      freeCap: 3,
      proCap: 33,
      sortOrder: 60,
    },
    {
      key: 'quran_bookmarks',
      label: 'علامات القرآن',
      visitorCap: 1,
      freeCap: 6,
      proCap: 66,
      sortOrder: 70,
    },
    { key: 'notes', label: 'الملاحظات', visitorCap: 1, freeCap: 8, proCap: 88, sortOrder: 80 },
    {
      key: 'mcp_connected_apps',
      label: 'تطبيقات MCP المتصلة',
      visitorCap: 0,
      freeCap: 2,
      proCap: 22,
      sortOrder: 90,
    },
  ],
  counters: [
    {
      key: 'downloader.job.create',
      label: 'تنزيل وسائط',
      window: 'lifetime',
      visitorCap: 1,
      freeCap: 5,
      proCap: 55,
      sortOrder: 10,
    },
    {
      key: 'scanner.scan',
      label: 'مسح رمز',
      window: 'daily',
      visitorCap: 1,
      freeCap: 5,
      proCap: 55,
      sortOrder: 30,
    },
    {
      key: 'quran.surah.read',
      label: 'قراءة سورة في اليوم',
      window: 'daily',
      visitorCap: 1,
      freeCap: 5,
      proCap: 55,
      sortOrder: 40,
    },
  ],
  quotas: [
    {
      key: 'news.story.cards',
      label: 'بطاقات أخبار في الصفحة',
      visitorCap: 1,
      freeCap: 6,
      proCap: 66,
      sortOrder: 10,
    },
    {
      key: 'news.sources',
      label: 'مصادر أخبار مختارة',
      visitorCap: 0,
      freeCap: 4,
      proCap: 44,
      sortOrder: 20,
    },
  ],
};

function usage(overrides: Partial<UsageState>): UsageState {
  return {
    plan: 'free',
    unlimited: false,
    expiresAt: null,
    counters: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.session.user = null;
  mocks.session.isLoading = false;
  mocks.usage.state = null;
  mocks.usage.loading = false;
});

afterEach(cleanup);

describe('PricingView', () => {
  it('renders every number from the catalog', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('$12')).toBeInTheDocument();

    // Each allowance comes from the same cap and counter rows.
    expect(screen.getByText(/حتى 77 عادة/)).toBeInTheDocument();
    expect(screen.getByText(/88 ملاحظة/)).toBeInTheDocument();
    expect(screen.getByText(/حتى 22 تطبيقات MCP/)).toBeInTheDocument();
    expect(screen.getByText(/55 تنزيلًا/)).toBeInTheDocument();
  });

  it('states the visitor allowance once, as a footnote', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText(/بدون حساب: 1 عنصر من كل نوع/)).toBeInTheDocument();
  });

  it('sends a guest to sign-in with the price in the WhatsApp message', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByRole('link', { name: 'ابدأ مجَّانًا' })).toHaveAttribute(
      'href',
      '/auth/login'
    );

    const subscribe = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.includes('wa.me'));

    expect(subscribe.length).toBe(1);
    expect(subscribe[0]?.getAttribute('href')).toContain(encodeURIComponent('$12'));
  });

  it('closes the free card for a member who already has it', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = usage({ plan: 'free' });
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('الخطَّة الحاليَّة')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: 'ابدأ مجَّانًا' })).not.toBeInTheDocument();

    // The paid plan is still theirs to buy.
    expect(screen.getByRole('link', { name: 'اشترِك الآن' })).toBeInTheDocument();
  });

  it('marks the paid plan as current and drops the free card action for a member', () => {
    mocks.session.user = { id: 'u1' };
    mocks.usage.state = usage({ plan: 'pro' });
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('الخطَّة الحاليَّة')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('link', { name: 'اشترِك الآن' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ابدأ مجَّانًا' })).not.toBeInTheDocument();
  });

  it('tells the reader the paid plan discounts the four services', () => {
    render(<PricingView catalog={catalog} />);

    expect(
      screen.getByText('خصم 20% على التَّدريب والاستشارات وبناء المشاريع والتَّعاقُد الشَّهري.')
    ).toBeInTheDocument();
  });

  it('sells the two plans and nothing else', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByRole('heading', { level: 1, name: 'خطط التَّسعير' })).toBeInTheDocument();
    expect(screen.getByText('موصَى به لك')).toBeInTheDocument();

    // The reference tables, the FAQ and the closing call to action live on
    // `/account/faq` or nowhere; the plans and the visitor line are the page.
    expect(screen.queryByText(/ما يستهلك الرصيد/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ما يمكنك حفظه/)).not.toBeInTheDocument();
    expect(screen.queryByText(/أسئلة شائعة/)).not.toBeInTheDocument();
    expect(screen.queryByText(/جاهز للبدء/)).not.toBeInTheDocument();
  });
});
