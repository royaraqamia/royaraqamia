import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ALL_SCOPES,
  SCOPE_LABELS,
  SCOPE_PRODUCT_GROUPS,
  scopesToLabels,
  shouldGrantAdminScope,
  TIER_SCOPES,
  hasAnyScope,
  isPublicToolScope,
} from '../scope';

const ADMIN_EMAILS = ['admin@example.com', 'admin2@example.com'];

beforeEach(() => {
  vi.stubEnv('ADMIN_EMAILS', ADMIN_EMAILS.join(','));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('ALL_SCOPES', () => {
  it('contains the expected 13 scopes', () => {
    expect(ALL_SCOPES).toHaveLength(13);
  });

  it('includes all expected granular scopes', () => {
    expect(ALL_SCOPES).toContain('blog.read');
    expect(ALL_SCOPES).toContain('blog.write');
    expect(ALL_SCOPES).toContain('linksnap.read');
    expect(ALL_SCOPES).toContain('linksnap.write');
    expect(ALL_SCOPES).toContain('spendtrack.read');
    expect(ALL_SCOPES).toContain('spendtrack.write');
    expect(ALL_SCOPES).toContain('habitflow.read');
    expect(ALL_SCOPES).toContain('habitflow.write');
    expect(ALL_SCOPES).toContain('certificates.read');
    expect(ALL_SCOPES).toContain('certificates.write');
    expect(ALL_SCOPES).toContain('profile.read');
    expect(ALL_SCOPES).toContain('profile.write');
    expect(ALL_SCOPES).toContain('admin');
  });
});

describe('SCOPE_LABELS', () => {
  it('has a human label for every scope', () => {
    for (const scope of ALL_SCOPES) {
      expect(SCOPE_LABELS[scope]).toBeDefined();
      expect(SCOPE_LABELS[scope].length).toBeGreaterThan(0);
    }
  });
});

describe('SCOPE_PRODUCT_GROUPS', () => {
  it('groups scopes by product', () => {
    expect(SCOPE_PRODUCT_GROUPS.Blog).toEqual(['blog.read', 'blog.write']);
    expect(SCOPE_PRODUCT_GROUPS.LinkSnap).toEqual(['linksnap.read', 'linksnap.write']);
    expect(SCOPE_PRODUCT_GROUPS.SpendTrack).toEqual(['spendtrack.read', 'spendtrack.write']);
    expect(SCOPE_PRODUCT_GROUPS.HabitFlow).toEqual(['habitflow.read', 'habitflow.write']);
    expect(SCOPE_PRODUCT_GROUPS.Certificates).toEqual(['certificates.read', 'certificates.write']);
    expect(SCOPE_PRODUCT_GROUPS.Profile).toEqual(['profile.read', 'profile.write']);
    expect(SCOPE_PRODUCT_GROUPS.Administration).toEqual(['admin']);
  });
});

describe('scopesToLabels', () => {
  it('maps scopes to their labels', () => {
    expect(scopesToLabels(['blog.read', 'admin'])).toEqual([
      'Read your blog posts and categories',
      'Full administrative access to all data',
    ]);
  });
});

describe('shouldGrantAdminScope', () => {
  it('returns true for emails in ADMIN_EMAILS (case-insensitive)', () => {
    expect(shouldGrantAdminScope('admin@example.com')).toBe(true);
    expect(shouldGrantAdminScope('ADMIN@EXAMPLE.COM')).toBe(true);
    expect(shouldGrantAdminScope('Admin@example.com')).toBe(true);
    expect(shouldGrantAdminScope(' admin@example.com ')).toBe(true);
  });

  it('returns false for emails not in ADMIN_EMAILS', () => {
    expect(shouldGrantAdminScope('user@example.com')).toBe(false);
    expect(shouldGrantAdminScope('')).toBe(false);
  });
});

describe('TIER_SCOPES', () => {
  it('anonymous has no scopes', () => {
    expect(TIER_SCOPES.anonymous).toEqual([]);
  });

  it('authenticated has product scopes but not admin', () => {
    expect(TIER_SCOPES.authenticated).toContain('blog.read');
    expect(TIER_SCOPES.authenticated).toContain('linksnap.write');
    expect(TIER_SCOPES.authenticated).not.toContain('admin');
  });

  it('admin has all scopes including admin', () => {
    expect(TIER_SCOPES.admin).toContain('blog.read');
    expect(TIER_SCOPES.admin).toContain('admin');
  });
});

describe('hasAnyScope', () => {
  it('returns true when any required scope is present', () => {
    expect(hasAnyScope(['blog.read', 'linksnap.read'], ['blog.read'])).toBe(true);
    expect(hasAnyScope(['blog.read'], ['linksnap.read', 'blog.read'])).toBe(true);
  });

  it('returns false when no required scope is present', () => {
    expect(hasAnyScope(['blog.read'], ['linksnap.read'])).toBe(false);
  });
});

describe('isPublicToolScope', () => {
  it('identifies public tool scopes', () => {
    expect(isPublicToolScope('blog.read')).toBe(true);
    expect(isPublicToolScope('certificates.read')).toBe(true);
    expect(isPublicToolScope('blog.write')).toBe(false);
    expect(isPublicToolScope('admin')).toBe(false);
  });
});
