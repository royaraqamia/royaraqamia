import type { ReactElement } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockGetOptionalUser = vi.fn();
const mockGeoCountry = vi.fn();

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

vi.mock('@/backend/transport/geo', () => ({
  geoCountry: () => mockGeoCountry(),
}));

vi.mock('@/backend/loaders/plans', () => ({
  loadPlanCatalog: async () => ({
    settings: { priceCents: 4900, currency: 'USD' },
    limits: [],
    counters: [],
    quotas: [],
  }),
}));

vi.mock('@/backend/config/subscriptions', () => ({
  createDefaultSubscriptionRequestService: () => ({ listMine: async () => [] }),
}));

import SubscribePage from '../page';

const MEMBER = { user: { id: 'user-1', email: 'member@example.com' } };

/**
 * The member branch is a second async server component, which a client render
 * cannot resolve, so the page's own job — read the header and hand it to the
 * provider that wraps both branches — is read off the element it returns. What
 * the picker then does with that value is `country-phone-input`'s own test.
 */
async function providerValue() {
  const tree = (await SubscribePage()) as ReactElement<{ value: string | null }>;
  return tree.props.value;
}

describe('the subscribe page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue(MEMBER);
  });

  /**
   * #1380: the page was the only form page that skipped the geo read, so its
   * phone picker fell back to a guessed country on the one number the Admin uses
   * to arrange activation (ADR-0176).
   */
  it('hands the form the country the platform resolved for the request', async () => {
    mockGeoCountry.mockResolvedValue('SY');

    expect(await providerValue()).toBe('SY');
  });

  it('hands down nothing when the platform could not place the request', async () => {
    mockGeoCountry.mockResolvedValue(null);

    expect(await providerValue()).toBeNull();
  });

  it('asks a guest to sign in rather than showing the form', async () => {
    mockGetOptionalUser.mockResolvedValue({ user: null });
    mockGeoCountry.mockResolvedValue('SY');

    render(await SubscribePage());

    expect(screen.getByRole('link', { name: 'تسجيل الدُّخول' })).toBeInTheDocument();
  });
});
