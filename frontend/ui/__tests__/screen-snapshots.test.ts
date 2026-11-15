import { describe, expect, it } from 'vitest';

import { composeScreenContext, type ScreenBase } from '@/frontend/state/screen-context';
import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { ScreenContext } from '@/shared/contracts/screen-context';
import { resolveScreen } from '@/shared/contracts/screens';
import { athkarScreenScope } from '@/frontend/ui/athkar/athkar-screen-scope';
import {
  habitflowHabitScope,
  habitflowScreenScope,
} from '@/frontend/ui/habitflow/habitflow-screen-scope';
import {
  linksnapScreenScope,
  linksnapUnlockScope,
} from '@/frontend/ui/linksnap/linksnap-screen-scope';
import { newsScreenScope } from '@/frontend/ui/news/news-screen-scope';
import { notesEditorScope, notesScreenScope } from '@/frontend/ui/notes/notes-screen-scope';
import {
  quranScreenScope,
  quranSurahScreenScope,
  quranTafsirScope,
} from '@/frontend/ui/quran/quran-screen-scope';
import { ratesScreenScope } from '@/frontend/ui/rates/rates-screen-scope';
import { scanScreenScope } from '@/frontend/ui/scan/scan-screen-scope';
import {
  spendtrackCategoriesScreenScope,
  spendtrackCategoryScope,
  spendtrackExpenseScope,
  spendtrackScreenScope,
} from '@/frontend/ui/spendtrack/spendtrack-screen-scope';

/**
 * The nine app roots, each with the snapshot it publishes (ADR-0181, #1420).
 *
 * One fixture per app: the route the member is on, the title the document
 * carries, and the scope the surface registers while it draws. The assertion is
 * the composition the turn actually receives — the registry's own screen id and
 * title, plus whatever the surface added — so a root that stops registering is
 * a failing fixture rather than a quiet gap.
 *
 * `title` stands in for `document.title` here: the publisher's own test proves
 * the browser's title reaches the snapshot, and this one proves each app's
 * registration composes with it.
 */
interface AppFixture {
  app: string;
  route: string;
  search?: string;
  screenId: string;
  title: string;
  scopes: ScreenScope[];
  expect: Partial<Pick<ScreenContext, 'tab' | 'focus' | 'fields' | 'overlays'>>;
}

const APPS: readonly AppFixture[] = [
  {
    app: 'news',
    route: '/news',
    screenId: 'news',
    title: 'أخبار اليوم',
    scopes: [newsScreenScope('public')],
    expect: { tab: 'public', focus: null, fields: {}, overlays: [] },
  },
  {
    app: 'rates',
    route: '/rates',
    screenId: 'rates',
    title: 'أسعار الصرف',
    scopes: [ratesScreenScope('parallel')],
    expect: { tab: 'parallel' },
  },
  {
    app: 'scan',
    route: '/scan',
    screenId: 'scan',
    title: 'ماسح الرموز',
    scopes: [scanScreenScope()],
    expect: { tab: null, focus: null, fields: {}, overlays: [] },
  },
  {
    app: 'quran',
    route: '/quran',
    screenId: 'quran',
    title: 'القرآن الكريم',
    scopes: [quranScreenScope()],
    expect: { tab: null, focus: null },
  },
  {
    app: 'quran-surah',
    route: '/quran/18',
    screenId: 'quran-surah',
    title: 'سورة الكهف',
    scopes: [quranSurahScreenScope(18)],
    expect: { focus: { kind: 'surah', id: '18' } },
  },
  {
    app: 'athkar',
    route: '/athkar/evening',
    screenId: 'athkar',
    title: 'أذكار الصباح والمساء',
    scopes: [athkarScreenScope('evening')],
    expect: { tab: 'evening' },
  },
  {
    app: 'linksnap',
    route: '/',
    search: 'tab=/linksnap',
    screenId: 'linksnap',
    title: 'اختصار الروابط',
    scopes: [linksnapScreenScope()],
    expect: { tab: '/linksnap', focus: null, fields: {} },
  },
  {
    app: 'linksnap-unlock',
    route: '/linksnap/unlock/abc123',
    screenId: 'linksnap-unlock',
    title: 'رابط محمي',
    scopes: [linksnapUnlockScope()],
    expect: { fields: {} },
  },
  {
    app: 'habitflow',
    route: '/habitflow',
    screenId: 'habitflow',
    title: 'تتبُّع العادات',
    scopes: [habitflowScreenScope(null)],
    expect: { focus: null },
  },
  {
    app: 'spendtrack',
    route: '/spendtrack',
    screenId: 'spendtrack',
    title: 'المصروفات',
    scopes: [spendtrackScreenScope('last_7')],
    expect: { tab: 'last_7' },
  },
  {
    app: 'spendtrack-categories',
    route: '/spendtrack/categories',
    screenId: 'spendtrack-categories',
    title: 'تصنيفات المصروفات',
    scopes: [spendtrackCategoriesScreenScope()],
    expect: { tab: null, focus: null, fields: {} },
  },
  {
    app: 'notes',
    route: '/notes',
    screenId: 'notes',
    title: 'الملاحظات',
    scopes: [notesScreenScope()],
    expect: { tab: null, focus: null, fields: {}, overlays: [] },
  },
];

/** The route provider's half of the snapshot, for one fixture. */
function baseOf(fixture: AppFixture): ScreenBase {
  const resolved = resolveScreen(fixture.route, fixture.search ?? '');
  return {
    route: fixture.route,
    product: resolved?.product ?? '',
    screenId: resolved?.screenId ?? '',
    title: fixture.title,
    tab: resolved?.tab ?? null,
  };
}

describe('the nine app roots', () => {
  for (const fixture of APPS) {
    it(`${fixture.app} answers with its screen id and title`, () => {
      const snapshot = composeScreenContext(baseOf(fixture), fixture.scopes);

      expect(snapshot.screenId).toBe(fixture.screenId);
      expect(snapshot.title).toBe(fixture.title);
      expect(snapshot.route).toBe(fixture.route);
      expect(snapshot).toMatchObject(fixture.expect);
    });
  }

  it('names the surface the route table carries, not a second list', () => {
    expect(APPS.map(({ route, search }) => resolveScreen(route, search ?? '')?.screenId)).toEqual(
      APPS.map(({ screenId }) => screenId)
    );
  });
});

describe('the records a surface puts in hand', () => {
  const notes = (): ScreenBase => baseOf(APPS.find(({ app }) => app === 'notes') as AppFixture);

  it('reports the note being edited and not its unsent body', () => {
    const scope = notesEditorScope({ id: 'note-1', body: 'مسودَّة لم تُرسل' });
    const snapshot = composeScreenContext(notes(), [notesScreenScope(), scope as ScreenScope]);

    expect(snapshot.focus).toEqual({ kind: 'note', id: 'note-1' });
    expect(snapshot.overlays).toEqual([{ id: 'notes.editor', kind: 'dialog' }]);
    expect(snapshot.fields).toEqual({});
    expect(JSON.stringify(snapshot)).not.toContain('مسودَّة');
  });

  it('reports the expense form’s allowlisted fields and nothing else', () => {
    const scope = spendtrackExpenseScope(
      {
        amount: '12.50',
        category_id: 'food',
        date: '2026-11-15',
        description: 'قهوة',
        currency: 'SYP',
        password: 'hunter2',
      },
      'expense-1'
    );
    const snapshot = composeScreenContext(
      baseOf(APPS.find(({ app }) => app === 'spendtrack') as AppFixture),
      [spendtrackScreenScope('this_month'), scope]
    );

    expect(snapshot.focus).toEqual({ kind: 'expense', id: 'expense-1' });
    expect(snapshot.fields).toEqual({
      amount: '12.50',
      category_id: 'food',
      date: '2026-11-15',
      description: 'قهوة',
      currency: 'SYP',
    });
    expect(JSON.stringify(snapshot)).not.toContain('hunter2');
  });

  it('reports a category’s two allowlisted fields and the row being edited', () => {
    const snapshot = composeScreenContext(
      baseOf(APPS.find(({ app }) => app === 'spendtrack-categories') as AppFixture),
      [
        spendtrackCategoriesScreenScope(),
        spendtrackCategoryScope({ name: 'طعام', colorHex: '#8f6fe5' }, 'category-1'),
      ]
    );

    expect(snapshot.fields).toEqual({ name: 'طعام', colorHex: '#8f6fe5' });
    expect(snapshot.focus).toEqual({ kind: 'category', id: 'category-1' });
    expect(snapshot.overlays).toEqual([{ id: 'spendtrack-categories.category', kind: 'dialog' }]);
  });

  it('reports the habit the edit dialog holds, above the dashboard', () => {
    const snapshot = composeScreenContext(
      baseOf(APPS.find(({ app }) => app === 'habitflow') as AppFixture),
      [habitflowScreenScope('habit-1'), habitflowHabitScope(true, 'habit-1') as ScreenScope]
    );

    expect(snapshot.focus).toEqual({ kind: 'habit', id: 'habit-1' });
    expect(snapshot.overlays).toEqual([{ id: 'habitflow.habit', kind: 'dialog' }]);
    expect(snapshot.fields).toEqual({});
  });

  it('reports the Ayah whose tafsir is open beside the sura', () => {
    const snapshot = composeScreenContext(
      baseOf(APPS.find(({ app }) => app === 'quran-surah') as AppFixture),
      [quranSurahScreenScope(18), quranTafsirScope(10) as ScreenScope]
    );

    expect(snapshot.focus).toEqual({ kind: 'ayah', id: '10' });
    expect(snapshot.overlays).toEqual([{ id: 'quran-surah.tafsir', kind: 'dialog' }]);
  });
});
