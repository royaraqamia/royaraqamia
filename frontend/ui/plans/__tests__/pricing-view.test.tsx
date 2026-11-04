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
 * up here proves the page reads the catalog instead of its own copy. The item
 * caps are uniform (6 free / 66 pro) because the card states one number for
 * every service; MCP keeps its own line at 1 / 12.
 */
const catalog: PlanCatalog = {
  settings: {
    priceCents: 1200,
    currency: 'USD',
    durationDays: 30,
  },
  limits: [
    { key: 'habits', label: 'العادات', visitorCap: 1, freeCap: 6, proCap: 66, sortOrder: 10 },
    { key: 'expenses', label: 'المصروفات', visitorCap: 1, freeCap: 6, proCap: 66, sortOrder: 20 },
    { key: 'budgets', label: 'الميزانيات', visitorCap: 1, freeCap: 6, proCap: 66, sortOrder: 30 },
    {
      key: 'short_links',
      label: 'الروابط المختصرة',
      visitorCap: 1,
      freeCap: 6,
      proCap: 66,
      sortOrder: 40,
    },
    {
      key: 'community_published',
      label: 'المنشورات المنشورة',
      visitorCap: 0,
      freeCap: 6,
      proCap: 66,
      sortOrder: 50,
    },
    {
      key: 'quran_bookmarks',
      label: 'علامات القرآن',
      visitorCap: 1,
      freeCap: 6,
      proCap: 66,
      sortOrder: 70,
    },
    { key: 'notes', label: 'الملاحظات', visitorCap: 1, freeCap: 6, proCap: 66, sortOrder: 80 },
    {
      key: 'mcp_connected_apps',
      label: 'تطبيقات MCP المتصلة',
      visitorCap: 0,
      freeCap: 1,
      proCap: 12,
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
  it('states the free plan in two lines, both from the catalog', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('6 عناصر كحد أقصى من كل خدمة.')).toBeInTheDocument();
    expect(screen.getByText('تطبيق MCP واحد كحد أقصى.')).toBeInTheDocument();
  });

  it('states the paid plan in three lines, both caps from the catalog', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByText('حتَّى 66 عنصر من كل خدمة.')).toBeInTheDocument();
    expect(screen.getByText('حتَّى 12 تطبيقات MCP.')).toBeInTheDocument();
    expect(
      screen.getByText('خصم 20% على التَّدريب والاستشارات وبناء المشاريع والتَّعاقُد الشَّهري.')
    ).toBeInTheDocument();
  });

  it('prints the smallest item cap when the catalog stops being uniform', () => {
    // One row below the others: the card states one number for every service, and
    // overstating it is a promise the database would refuse.
    const drifted: PlanCatalog = {
      ...catalog,
      limits: catalog.limits.map((limit) =>
        limit.key === 'notes' ? { ...limit, freeCap: 3 } : limit
      ),
    };

    render(<PricingView catalog={drifted} />);

    expect(screen.getByText('3 عناصر كحد أقصى من كل خدمة.')).toBeInTheDocument();
  });

  it('writes a plural MCP line when the free cap is above one', () => {
    const twoApps: PlanCatalog = {
      ...catalog,
      limits: catalog.limits.map((limit) =>
        limit.key === 'mcp_connected_apps' ? { ...limit, freeCap: 2 } : limit
      ),
    };

    render(<PricingView catalog={twoApps} />);

    expect(screen.getByText('حتَّى 2 تطبيقات MCP.')).toBeInTheDocument();
  });

  it('stops listing the counted actions it no longer promises in numbers', () => {
    render(<PricingView catalog={catalog} />);

    // The bullets are gone on purpose: the plan page states the allowance a member
    // is actually consuming, and a refusal names what is left.
    expect(screen.queryByText(/تنزيلات/)).not.toBeInTheDocument();
    expect(screen.queryByText(/عمليات مسح/)).not.toBeInTheDocument();
    expect(screen.queryByText(/سور/)).not.toBeInTheDocument();
    expect(screen.queryByText(/بطاقات في/)).not.toBeInTheDocument();
    expect(screen.queryByText(/دعم مباشر عبر واتساب/)).not.toBeInTheDocument();
    expect(screen.queryByText(/تحسين خدمات Google/)).not.toBeInTheDocument();
  });

  it('sends a guest to sign-in, and the paid pill to the subscribe form', () => {
    render(<PricingView catalog={catalog} />);

    expect(screen.getByRole('link', { name: 'ابدأ مجَّانًا' })).toHaveAttribute(
      'href',
      '/auth/login'
    );

    // No WhatsApp hand-off: the request becomes a row an Admin can answer.
    expect(
      screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.includes('wa.me'))
    ).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'اشترِك الآن' })).toHaveAttribute(
      'href',
      '/pricing/subscribe'
    );
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
