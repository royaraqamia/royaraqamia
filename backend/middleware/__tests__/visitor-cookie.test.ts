import { describe, it, expect, vi } from 'vitest';
import {
  VISITOR_COOKIE_NAME,
  readVisitorKey,
  stampVisitorCookie,
  visitorKeyFor,
} from '@/backend/middleware/visitor-cookie';

const VALID = '11111111-2222-4333-8444-555555555555';

const requestWith = (value?: string) =>
  ({ cookies: { get: () => (value === undefined ? undefined : { value }) } }) as never;

const responseStub = () => {
  const set = vi.fn();
  return { response: { cookies: { set } } as never, set };
};

describe('the visitor id', () => {
  it('reads a carried id and refuses anything that is not one of ours', () => {
    expect(readVisitorKey(requestWith(VALID))).toBe(VALID);
    expect(readVisitorKey(requestWith(undefined))).toBeNull();
    // A hand-written cookie names no counted subject (ADR-0093).
    expect(readVisitorKey(requestWith('not-a-uuid'))).toBeNull();
  });

  it('counts with the carried id, and does not re-mint it', () => {
    expect(visitorKeyFor(requestWith(VALID))).toEqual({ key: VALID, minted: false });
  });

  it('mints the id the first counted action counts against (ADR-0176)', () => {
    const { key, minted } = visitorKeyFor(requestWith(undefined));
    expect(minted).toBe(true);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('stamps a minted id as an httpOnly, same-site cookie on a route that is not cached', () => {
    const { response, set } = responseStub();
    stampVisitorCookie(response, VALID);

    expect(set).toHaveBeenCalledWith(
      VISITOR_COOKIE_NAME,
      VALID,
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    );
  });
});
