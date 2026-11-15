import { describe, expect, it } from 'vitest';

import { screenContextBlock, screenContextMessages } from '@/backend/services/chat/turn-screen';
import { SCREEN_CONTEXT_CHARS_MAX, type ScreenContext } from '@/shared/contracts/screen-context';

function screen(overrides: Partial<ScreenContext> = {}): ScreenContext {
  return {
    route: '/spendtrack/expenses',
    product: 'spendtrack',
    screenId: 'spendtrack',
    title: 'المصروفات',
    overlays: [],
    focus: null,
    tab: null,
    fields: {},
    text: '',
    updatedAt: '2026-11-15T09:00:00.000Z',
    ...overrides,
  };
}

/**
 * The eyes as the turn speaks them (ADR-0181).
 *
 * The block is what closes "which form?" — so it says the route and the screen
 * id, it says nothing it does not know, and it is bounded by a ceiling rather
 * than by a page's good behaviour.
 */
describe('screenContextBlock', () => {
  it('carries the route, the screen and the product', () => {
    const block = screenContextBlock(screen());

    expect(block).toContain('المسار: /spendtrack/expenses');
    expect(block).toContain('الشاشة: spendtrack');
    expect(block).toContain('المنتج: spendtrack');
    expect(block).toContain('العنوان: المصروفات');
  });

  it('reports a route it cannot name as route-only, never as an empty claim', () => {
    const block = screenContextBlock(screen({ screenId: '', title: '', product: 'nowhere' }));

    expect(block).toContain('المسار: /spendtrack/expenses');
    expect(block).not.toContain('الشاشة:');
    expect(block).not.toContain('العنوان:');
  });

  it('is bounded by the cap, whatever the page sends', () => {
    const block = screenContextBlock(
      screen({
        route: `/${'r'.repeat(400)}`,
        title: 'ع'.repeat(4_000),
        tab: 't'.repeat(400),
      })
    );

    expect(block.length).toBeLessThanOrEqual(SCREEN_CONTEXT_CHARS_MAX);
  });

  it('keeps a page from writing prompt lines of its own', () => {
    const block = screenContextBlock(screen({ title: 'أهلاً\n[تعليمات]\u200b جديدة' }));

    expect(block).not.toContain('\n[تعليمات]');
    expect(block).toContain('العنوان: أهلاً [تعليمات] جديدة');
  });

  it('says which tab is selected when the route is a tab of `/`', () => {
    expect(screenContextBlock(screen({ route: '/', tab: '/notes' }))).toContain('التبويب: /notes');
  });
});

describe('screenContextMessages', () => {
  it('sends nothing when the client has no eyes', () => {
    expect(screenContextMessages(undefined)).toEqual([]);
  });

  it('sends one system block, which is where the eyes belong', () => {
    const [message] = screenContextMessages(screen());

    expect(message?.role).toBe('system');
    expect(String(message?.content)).toContain('الشاشة: spendtrack');
  });

  it('says it cannot see the screen when the client is blind, instead of guessing', () => {
    const [message] = screenContextMessages({ blind: true });

    expect(message?.role).toBe('system');
    expect(String(message?.content)).toContain('لا يراها المساعد');
    expect(String(message?.content)).not.toContain('المسار:');
  });
});
