import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { createCertificatesRepository } from '@/backend/config/certificates';
import { createPostsRepository } from '@/backend/config/blogpress';
import { createHabitService } from '@/backend/config/habitflow';
import { createSpendtrackService } from '@/backend/config/spendtrack';
import { createPublicConsultationService } from '@/backend/config/consultation';
import { createDefaultTrainingApplicationService } from '@/backend/config/training';
import { createDefaultProjectRequestService } from '@/backend/config/project-requests';
import { createProfileService } from '@/backend/config/users';
import { createUsageService } from '@/backend/config/plans';
import { createAgentMemoryFor } from '@/backend/config/agent-memory';
import { createNewsPreferencesServiceFor, createNewsServiceFor } from '@/backend/config/news';
import { createRatesService } from '@/backend/config/rates';
import { createScanHistoryService } from '@/backend/config/scan-history';
import { listAthkarSets, readAthkarSet } from '@/backend/services/athkar/athkar-read';
import {
  QURAN_SEARCH_MAX_HITS,
  SURAH_VERSE_WINDOW,
  listSurahs,
  readSurah,
  readVerse,
  searchQuran,
} from '@/backend/services/quran/quran-read';
import { ATHKAR_PERIODS } from '@/shared/contracts/athkar';
import { SCAN_HISTORY_KIND_LABELS } from '@/shared/contracts/scan-history';
import { applyNewsCardLimit, resolveNewsCardCap } from '@/backend/services/news/card-limit';
import { listAgencySkills, loadAgencySkill } from '@/backend/services/chat/agency-skills';
import { screenContextAnswer } from '@/backend/services/chat/turn-screen';
import type { CapabilityOwner, ToolTier } from '@/backend/services/tools/registry';
import type { ScreenContextInput } from '@/shared/contracts/screen-context';
import { toPublicCertificate } from '@/shared/contracts/certificates';
import { PostSlugSchema } from '@/shared/contracts/community';
import { COURSE_SLUGS } from '@/shared/contracts/training';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_LABELS,
  NEWS_REGION_LABELS,
  type NewsCategory,
  type NewsStory,
} from '@/shared/contracts/news';
import {
  DISPLAY_CURRENCY_CODES,
  DISPLAY_CURRENCY_SET,
  RATE_BASES,
  RATE_RANGES,
  type RateBasis,
  type RatesBoard,
} from '@/shared/contracts/rates';
import { buildLookup, computeChangePct, convertAmount, type RateLookup } from '@/shared/rates';
import { AGENT_MEMORY_KINDS, MEMORY_TEXT_MAX } from '@/backend/shared/domain/agent-memory';
import {
  PROJECT_REQUEST_TYPES,
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_TIMELINES,
} from '@/shared/contracts/project-requests';
import { ProfileNameSchema } from '@/shared/contracts/users';
import { whatsappPhoneRegex } from '@/shared/contracts/phone';
import type { ChatAgentToolKind, ChatAgentToolName } from '@/shared/contracts/chat-agent-actions';
import {
  WEB_SEARCH_QUERY_MAX,
  WEB_SEARCH_QUERY_MIN,
  WEB_SEARCH_UNAVAILABLE,
  type WebSearchResult,
} from '@/shared/contracts/web-search';

/**
 * The assistant's tools (ADR-0113, #818).
 *
 * Every tool is declared once here: a name, a Zod schema for its arguments, a
 * line the model reads, and a call into the product's own service. Two rules
 * are structural rather than remembered:
 *
 * - **The member is the caller.** `userId` arrives in the context from the
 *   session and is never part of a tool's arguments, so the model cannot name
 *   somebody else. Every schema is strict, so an argument object that tries is
 *   refused instead of silently stripped.
 * - **A tool above tier 0 runs only on confirmation.** It is never called from
 *   the turn; the turn only proposes it, and `confirm` is the one caller of
 *   `run`. Tier 0 is the only tier whose answer reaches the model (ADR-0180).
 */

export interface ChatAgentToolContext {
  /** The caller, injected by the server. */
  userId: string;
  /** The caller's own session client: policies apply to everything it does. */
  supabase: SupabaseClient<Database>;
  /** The caller's address, for the services that rate-limit a submission. */
  ip: string;
  /**
   * The turn's search over the apps the member connected, when there is one
   * (ADR-0155, decision 7). The matches are declared to the model for the next
   * round, so a miss in the router costs one call, not the turn.
   */
  findAppTools?: (
    query: string
  ) => Promise<Array<{ name: string; appName: string; description: string; readOnly: boolean }>>;
  /**
   * The snapshot the request carried (ADR-0181, decision 7). It is the turn's
   * own copy, not a cache: the server has no channel to the page while it
   * answers, so a newer one cannot exist, and returning another turn's would be
   * a page the member has left. Absent when the client has no eyes here.
   */
  screen?: ScreenContextInput;
  /**
   * The web, when the deployment has a search key (ADR-0205). The turn wires
   * this to a counted call; a turn with no client passes nothing, and
   * `search_web` is not declared at all.
   */
  searchWeb?: (query: string) => Promise<WebSearchResult>;
}

export interface ChatAgentTool {
  name: ChatAgentToolName;
  kind: ChatAgentToolKind;
  /** Which product owns it: the coverage axis of the registry (ADR-0183). */
  product: CapabilityOwner;
  /** Its blast radius: 0 for a read, 1..3 for a write (ADR-0180). */
  tier: ToolTier;
  /** What the model is told the tool is for. Arabic, one line. */
  description: string;
  /** Strict: an unknown key is a refusal, not something quietly dropped. */
  schema: z.ZodTypeAny;
  /** Runs as the member, with the member's own client. */
  run(args: unknown, context: ChatAgentToolContext): Promise<unknown>;
  /**
   * How much of the answer reaches the model. Defaults to the service's bound;
   * a tool returning a document (a specialist's instructions) raises it.
   */
  maxResultChars?: number;
}

const NoArgs = z.strictObject({});

const ReminderTime = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'الوقت بصيغة HH:mm');

const PostStatusArgs = z.strictObject({
  status: z.enum(['draft', 'published', 'scheduled']).nullish(),
});

const PostSlugArgs = z.strictObject({ slug: PostSlugSchema });

const ListSpecialistsArgs = z.strictObject({
  division: z.string().trim().min(1).max(40).optional(),
});

const LoadSpecialistArgs = z.strictObject({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'معرّف المتخصص غير صالح'),
});

const CreateDraftArgs = z.strictObject({
  meta_title: z.string().trim().min(2, 'عنوان المنشور مطلوب').max(70, 'العنوان طويل جداً'),
  content: z.string().trim().min(1, 'نصّ المنشور مطلوب').max(20_000, 'النصّ طويل جداً'),
});

const EditDraftArgs = z.strictObject({
  post_id: z.string().uuid('معرِّف المنشور غير صالح'),
  content: z.string().trim().min(1, 'نصّ المنشور مطلوب').max(20_000, 'النصّ طويل جداً'),
});

const PublishDraftArgs = z.strictObject({ post_id: z.string().uuid('معرِّف المنشور غير صالح') });

const RecordExpenseArgs = z.strictObject({
  amount: z.number().positive('المبلغ غير صالح').max(1_000_000_000, 'المبلغ كبير جداً'),
  category: z.string().trim().min(1, 'التصنيف مطلوب').max(50, 'اسم التصنيف طويل جداً'),
  description: z.string().trim().max(200, 'الوصف طويل جداً').optional(),
  currency: z.string().trim().length(3, 'العملة ثلاثة أحرف').optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'التاريخ بصيغة YYYY-MM-DD')
    .optional(),
});

const EditExpenseArgs = z.strictObject({
  expense_id: z.string().uuid('معرِّف المصروف غير صالح'),
  amount: z.number().positive('المبلغ غير صالح').max(1_000_000_000, 'المبلغ كبير جداً').optional(),
  category: z.string().trim().min(1).max(50).optional(),
});

const CreateHabitArgs = z.strictObject({
  name: z.string().trim().min(1, 'اسم العادة مطلوب').max(80, 'الاسم طويل جداً'),
  frequency: z.enum(['daily', 'weekly']).optional(),
});

const HabitReminderArgs = z.strictObject({
  habit_name: z.string().trim().min(1, 'اسم العادة مطلوب').max(80, 'الاسم طويل جداً'),
  reminder_time: ReminderTime.nullable(),
});

const BookConsultationArgs = z.strictObject({
  package_id: z.string().uuid('الباقة غير صحيحة'),
  slot_ids: z.array(z.string().uuid()).min(1, 'اختر موعداً واحداً على الأقل'),
  full_name: z.string().trim().min(2, 'الاسم مطلوب').max(120, 'الاسم طويل جداً'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  topic_description: z.string().trim().min(30, 'اشرح الموضوع').max(2_000, 'الوصف طويل جداً'),
});

const ApplyTrainingArgs = z.strictObject({
  course_slug: z.enum(COURSE_SLUGS, 'الدورة غير متوفِّرة'),
  cohort_id: z.string().uuid('الدُّفعة غير صحيحة'),
  full_name: z.string().trim().min(2, 'الاسم مطلوب').max(120, 'الاسم طويل جداً'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  goal: z.string().trim().max(1_000, 'النصّ طويل جداً').optional(),
});

const ProjectRequestArgs = z.strictObject({
  full_name: z.string().trim().min(2, 'الاسم مطلوب').max(120, 'الاسم طويل جداً'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  project_type: z.enum(PROJECT_REQUEST_TYPES, 'نوع المشروع غير صالح'),
  description: z.string().trim().min(20, 'اشرح المشروع').max(2_000, 'الوصف طويل جداً'),
  email: z.string().trim().email('البريد غير صالح').optional(),
  budget_range: z.enum(PROJECT_REQUEST_BUDGET_RANGES, 'الميزانية غير صالحة').optional(),
  timeline: z.enum(PROJECT_REQUEST_TIMELINES, 'المدة غير صالحة').optional(),
  existing_url: z.string().trim().url('الرابط غير صالح').optional(),
});

const ChangeNameArgs = z.strictObject({ name: ProfileNameSchema });

const LatestNewsArgs = z.strictObject({
  category: z.enum(NEWS_CATEGORIES, 'التصنيف غير صالح').optional(),
});

const NewsItemArgs = z.strictObject({
  id: z.string().trim().uuid('معرِّف الخبر غير صالح'),
});

/**
 * A three-letter currency code, as the member would say it ("الدولار" is the
 * model's job to turn into `USD`). Upper-cased here so the board's own keys
 * match, whatever the model typed.
 */
const CurrencyCode = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, 'رمز العملة ثلاثة أحرف لاتينية')
  .transform((value) => value.toUpperCase());

const RatePairArgs = z.strictObject({ from: CurrencyCode, to: CurrencyCode });
const RateHistoryArgs = z.strictObject({
  code: CurrencyCode,
  range: z.enum(RATE_RANGES).optional(),
  basis: z.enum(RATE_BASES).optional(),
});

/** One sura, or a window of it. A whole sura can be 286 Ayat, so the window is named. */
const SurahArgs = z.strictObject({
  surah: z.number().int().min(1).max(114),
  from: z.number().int().min(1).max(286).optional(),
  to: z.number().int().min(1).max(286).optional(),
});

/** A reference is the sura and the Ayah inside it, both 1-based. */
const VerseArgs = z.strictObject({
  surah: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
});

const QuranSearchArgs = z.strictObject({
  query: z.string().trim().min(2, 'اكتب كلمتين على الأقل للبحث').max(100, 'البحث أطول من المسموح'),
  limit: z.number().int().min(1).max(QURAN_SEARCH_MAX_HITS).optional(),
});

const AthkarArgs = z.strictObject({ period: z.enum(ATHKAR_PERIODS) });

const ScanHistoryArgs = z.strictObject({
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * What the model may ask to save. Only the fact and its kind: the scope and its
 * key are the server's (the tool always remembers for the account), so a model
 * cannot pin a fact to a thread or a product it does not know.
 */
const RememberArgs = z.strictObject({
  text: z.string().trim().min(1, 'اكتب ما تريد أن أتذكّره').max(MEMORY_TEXT_MAX, 'النصّ طويل جداً'),
  kind: z.enum(AGENT_MEMORY_KINDS).optional(),
});

const FindAppToolsArgs = z.strictObject({
  query: z.string().trim().min(2, 'اكتب ما تبحث عنه').max(120, 'النصّ طويل جداً'),
});

/** A search query is the question's own words, never the member's details. */
const SearchWebArgs = z.strictObject({
  query: z
    .string()
    .trim()
    .min(WEB_SEARCH_QUERY_MIN, 'الاستعلام قصير جداً')
    .max(WEB_SEARCH_QUERY_MAX, 'الاستعلام طويل جداً'),
});

/** The Damascus calendar day, which is the day every meter in the app resets on. */
function damascusToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Damascus',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function daysAgo(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** A slug the community route already accepts, from the title the member wrote. */
function slugOf(title: string, fallbackId: string): string {
  const base = title
    .trim()
    .replace(/[^\w\u0600-\u06FF-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || `post-${fallbackId.slice(0, 8)}`;
}

/** The member's categories by name, which is how a model can name one. */
async function categoriesByName(context: ChatAgentToolContext): Promise<Map<string, string>> {
  const categories = await createSpendtrackService(context.supabase).getUserCategories(
    context.userId
  );
  return new Map(categories.map((category) => [category.name.trim(), category.id]));
}

function unknownCategory(name: string, categories: Map<string, string>): { error: string } {
  const known = [...categories.keys()].join('، ');
  return { error: `لا يوجد تصنيف باسم «${name}». التصنيفات المتاحة: ${known || 'لا شيء'}` };
}

/**
 * The news digest as the page reads it for this member: the shared board
 * narrowed to the sources they kept, then cut to their plan's card allowance
 * (ADR-0093).
 *
 * The tool composes the same two steps the board route applies rather than
 * reaching for the page's loader, so nothing here can show a story the site
 * would hide. A failed preference read is the full digest, which is never
 * wrong — the same answer the loader gives (#620).
 */
async function newsBoardFor(context: ChatAgentToolContext, category?: NewsCategory) {
  const preferences = await createNewsPreferencesServiceFor(context.supabase)
    .get(context.userId)
    .catch(() => null);

  const board = await createNewsServiceFor(context.supabase).getBoard(
    category ? { category } : {},
    { sourceIds: preferences?.sourceIds ?? null }
  );

  const cap = await resolveNewsCardCap(context.userId);
  return applyNewsCardLimit(board, cap, false);
}

/** One story as the model reads it: the card the page draws, and its id. */
function newsStoryCard(story: NewsStory): Record<string, unknown> {
  return {
    id: story.id,
    category: NEWS_CATEGORY_LABELS[story.category],
    headline: story.headline,
    summary: story.summary,
    why_it_matters: story.whyItMatters,
    source: story.sourceName,
  };
}

/**
 * One side of a pair, read through the converter the `/rates` page uses
 * (`shared/rates.ts`), so a rate the assistant quotes is the rate the converter
 * shows for the same two currencies.
 *
 * `change_pct` is the traded currency's own day-on-day move, which is the pair's
 * move only when the other side is the board's base. A cross pair has no daily
 * change the site shows either, so it answers null rather than a derived number.
 */
function pairQuote(
  board: RatesBoard,
  lookup: RateLookup,
  from: string,
  to: string,
  basis: RateBasis
): { rate: number; as_of: string | null; change_pct: number | null } | null {
  if (from === to) {
    return { rate: 1, as_of: board.providerQuoteDate, change_pct: 0 };
  }

  const conversion = convertAmount(lookup, from, to, 1, basis);
  if (!conversion) return null;

  const traded = board.currencies.find((currency) => currency.code === to);

  let legAsOf: string | null = null;
  if (from === board.base) {
    legAsOf = basis === 'parallel' ? (traded?.parallel?.asOf ?? null) : (traded?.asOf ?? null);
  }
  const asOf = legAsOf ?? board.providerQuoteDate;

  const changePct =
    from !== board.base
      ? null
      : basis === 'parallel'
        ? (traded?.parallel?.changePct ?? null)
        : (traded?.changePct ?? null);

  return { rate: conversion.rate, as_of: asOf, change_pct: changePct };
}

const tools: ChatAgentTool[] = [
  // --- reads ---------------------------------------------------------------
  {
    name: 'list_certificates',
    kind: 'read',
    product: 'certificates',
    tier: 0,
    description: 'الشهادات التي حصل عليها العضو.',
    schema: NoArgs,
    async run(_args, context) {
      const certificates = await createCertificatesRepository(context.supabase).listByRecipient(
        context.userId
      );
      return certificates.map(toPublicCertificate);
    },
  },
  {
    name: 'get_usage_state',
    kind: 'read',
    product: 'account',
    tier: 0,
    description: 'خطة العضو واستخدامه لما تسمح به الخطة.',
    schema: NoArgs,
    async run(_args, context) {
      return createUsageService().state(context.userId);
    },
  },
  {
    name: 'list_consultation_bookings',
    kind: 'read',
    product: 'consultations',
    tier: 0,
    description: 'حجوزات الاستشارة الخاصة بالعضو وحالتها.',
    schema: NoArgs,
    async run(_args, context) {
      return createPublicConsultationService().listMyBookings(context.userId);
    },
  },
  {
    name: 'list_consultation_options',
    kind: 'read',
    product: 'consultations',
    tier: 0,
    description: 'باقات الاستشارة المتاحة والمواعيد الفارغة، لاختيار ما يُحجز.',
    schema: NoArgs,
    async run() {
      const service = createPublicConsultationService();
      const [packages, slots] = await Promise.all([
        service.getActivePackages(),
        service.getAvailableSlots(),
      ]);
      return { packages, slots };
    },
  },
  {
    name: 'list_my_posts',
    kind: 'read',
    product: 'community',
    tier: 0,
    description: 'منشورات العضو ومسوداته في المجتمع.',
    schema: PostStatusArgs,
    async run(args, context) {
      const { status } = PostStatusArgs.parse(args);
      const posts = await createPostsRepository(context.supabase).listPostsByAuthor(context.userId);
      return posts
        .filter((post) => !post.deleted_at && (!status || post.status === status))
        .map((post) => ({
          id: post.id,
          slug: post.slug,
          title: post.meta_title,
          status: post.status,
          updated_at: post.updated_at,
        }));
    },
  },
  {
    name: 'get_post_by_slug',
    kind: 'read',
    product: 'community',
    tier: 0,
    description: 'منشور منشور واحد برابطه.',
    schema: PostSlugArgs,
    async run(args, context) {
      const { slug } = PostSlugArgs.parse(args);
      const post = await createPostsRepository(context.supabase).getPublishedPostBySlug(slug);
      if (!post) return { found: false };
      return {
        found: true,
        slug: post.slug,
        title: post.meta_title,
        content: post.content,
        status: post.status,
        published_at: post.published_at,
        is_mine: post.author_id === context.userId,
      };
    },
  },
  {
    name: 'get_habits_summary',
    kind: 'read',
    product: 'habitflow',
    tier: 0,
    description: 'ملخّص عادات العضو وتذكيراتها وإنجاز آخر سبعة أيام.',
    schema: NoArgs,
    async run(_args, context) {
      const { service } = createHabitService(context.userId, context.supabase);
      const habits = await service.getAllHabits();
      const today = damascusToday();
      const start = daysAgo(today, 6);
      const logs = await service.getLogs(start, today);

      const completions = new Map<string, number>();
      for (const log of logs) {
        if (log.completed) {
          completions.set(log.habitId, (completions.get(log.habitId) ?? 0) + 1);
        }
      }

      return {
        today,
        week_start: start,
        habits: habits.map((habit) => ({
          id: habit.id,
          name: habit.name,
          frequency: habit.frequency,
          reminder_time: habit.reminderTime ?? null,
          completed_last_7_days: completions.get(habit.id) ?? 0,
        })),
      };
    },
  },
  {
    name: 'get_expenses_summary',
    kind: 'read',
    product: 'spendtrack',
    tier: 0,
    description: 'مصروفات العضو هذا الشهر، وأحدث العمليات لاختيار واحدة لتعديلها.',
    schema: NoArgs,
    async run(_args, context) {
      const service = createSpendtrackService(context.supabase);
      const today = damascusToday();
      const start = `${today.slice(0, 7)}-01`;

      const [total, recent] = await Promise.all([
        service.getTotalExpenses(context.userId, start, today, null),
        service.getTransactions({
          userId: context.userId,
          start,
          end: today,
          filterCategories: [],
          sort: 'date_desc',
          pageSize: 10,
        }),
      ]);

      return {
        month_start: start,
        today,
        total: total ?? 0,
        recent: recent.expenses.map((expense) => ({
          id: expense.id,
          amount: expense.amount,
          currency: expense.currency,
          date: expense.date,
          description: expense.description,
          category_id: expense.category_id,
        })),
      };
    },
  },

  // --- writes --------------------------------------------------------------
  {
    name: 'get_latest_news',
    kind: 'read',
    product: 'news',
    tier: 0,
    description:
      'ملخّص أخبار اليوم من صفحة الأخبار: تاريخ الملخّص وعنوانه ومقدّمته وأخباره كما تظهر للعضو، وبوسيط category أخبار تصنيف واحد فقط. عدد الأخبار يتبع خطة العضو، فما حُجب عنها لا يظهر هنا.',
    schema: LatestNewsArgs,
    // A digest is at most twelve stories of a 420-character summary plus their
    // headline and the one line of why it matters; this bound carries the widest
    // day the workflow may publish without cutting the JSON a turn reads.
    maxResultChars: 12_000,
    async run(args, context) {
      const { category } = LatestNewsArgs.parse(args);
      const board = await newsBoardFor(context, category);

      if (!board.day) {
        return {
          has_any_digest: board.hasAnyDigest,
          date: null,
          stories: [],
          note: board.hasAnyDigest ? 'لا خبر في هذا التصنيف اليوم.' : 'لم يُنشر ملخّص أخبار بعد.',
        };
      }

      const { digest, stories } = board.day;
      return {
        date: digest.date,
        title: digest.title,
        lede: digest.lede,
        // The plan's allowance, when it hid stories from the day (ADR-0093).
        cards: board.cards,
        // What the member's own source selection did to the day; null when they
        // kept none.
        preferences: board.preferences,
        stories: stories.map(newsStoryCard),
      };
    },
  },
  {
    name: 'get_news_item',
    kind: 'read',
    product: 'news',
    tier: 0,
    description:
      'خبر واحد كامل بمعرّفه، كما يعيده get_latest_news: العنوان والملخّص وسبب الأهمية والمصدر ورابطه. واحد لا أكثر، فكل خبر بطاقة واحدة تسمح بها كل خطة.',
    schema: NewsItemArgs,
    async run(args, context) {
      const { id } = NewsItemArgs.parse(args);
      const story = await createNewsServiceFor(context.supabase).getStory(id);
      // The retained window is seven days, so "not found" is also "the site no
      // longer has it".
      if (!story) return { found: false };

      return {
        found: true,
        id: story.id,
        date: story.digestDate,
        category: NEWS_CATEGORY_LABELS[story.category],
        region: NEWS_REGION_LABELS[story.region],
        headline: story.headline,
        summary: story.summary,
        why_it_matters: story.whyItMatters,
        source: story.sourceName,
        source_url: story.sourceUrl,
        source_published_at: story.sourcePublishedAt,
      };
    },
  },
  {
    name: 'get_rate',
    kind: 'read',
    product: 'rates',
    tier: 0,
    description:
      'سعر صرف عملة مقابل أخرى الآن من صفحة أسعار الصرف: الوحدة من from تساوي كم من to، مع تاريخ التسعير (as_of) ووقت القراءة. يعيد السعر الرسمي ودائماً السعر الموازي إن وُجد.',
    schema: RatePairArgs,
    async run(args, context) {
      const { from, to } = RatePairArgs.parse(args);
      const unknown = [from, to].find((code) => !DISPLAY_CURRENCY_SET.has(code));
      if (unknown) {
        return {
          error: `لا يتابع الموقع عملة «${unknown}». العملات المتاحة: ${DISPLAY_CURRENCY_CODES.join('، ')}`,
        };
      }

      const board = await createRatesService(context.supabase).getBoard();
      if (!board) return { error: 'لا توجد أسعار حفظها الخادم بعد. تُحدَّث أسعار الصرف يومياً.' };

      const lookup = buildLookup(board);
      const official = pairQuote(board, lookup, from, to, 'official');
      if (!official) return { error: `تعذّر حساب سعر ${from}/${to}.` };

      // The parallel market is quoted per base currency; a cross pair's parallel
      // value would blend two markets, which the site never shows.
      const parallel =
        from === board.base && lookup.parallel[to] !== undefined
          ? pairQuote(board, lookup, from, to, 'parallel')
          : null;

      return {
        pair: `${from}/${to}`,
        base: board.base,
        read_at: new Date().toISOString(),
        quote_date: board.providerQuoteDate,
        stale: board.isStale,
        official,
        parallel,
      };
    },
  },
  {
    name: 'get_rate_history',
    kind: 'read',
    product: 'rates',
    tier: 0,
    description:
      'تاريخ سعر عملة أو ذهب/فضّة مقابل الدولار من صفحة أسعار الصرف: نقاط يومية للفترة 1W أو 1M أو 1Y، بخطّ رسم بياني على رسم الصفحة. مع أساس السعر الرسمي أو الموازي للعملات المزدوجة.',
    schema: RateHistoryArgs,
    // A year of daily points is the widest series the page draws; the compact
    // [date, value] pairs keep all of it inside one turn's answer.
    maxResultChars: 12_000,
    async run(args, context) {
      const input = RateHistoryArgs.parse(args);
      const range = input.range ?? '1M';
      const basis = input.basis ?? 'official';
      const series = await createRatesService(context.supabase).getSeries(input.code, range, basis);

      if (!series || series.points.length === 0) {
        return { found: false, code: input.code, range, basis };
      }

      const values = series.points.map((point) => point.value);
      const first = series.points[0]!;
      const last = series.points[series.points.length - 1]!;

      return {
        found: true,
        code: series.code,
        kind: series.kind,
        range,
        basis,
        read_at: new Date().toISOString(),
        columns: ['date', 'value'],
        points: series.points.map((point) => [point.date, point.value]),
        summary: {
          points: series.points.length,
          first: { date: first.date, value: first.value },
          last: { date: last.date, value: last.value },
          min: Math.min(...values),
          max: Math.max(...values),
          change_pct: computeChangePct(last.value, first.value),
        },
      };
    },
  },
  {
    name: 'list_surahs',
    kind: 'read',
    product: 'quran',
    tier: 0,
    description:
      'قائمة سور القرآن الـ114 كما تعرضها صفحة القرآن: رقم السورة واسمها وعدد آياتها ومكّية أو مدنية. اقرئي منها لتختاري سورة يطلبها العضو، ولا تعيدي القائمة كاملة إلا إن طلبها.',
    schema: NoArgs,
    maxResultChars: 12_000,
    async run() {
      const surahs = await listSurahs();
      return { count: surahs.length, surahs };
    },
  },
  {
    name: 'get_surah',
    kind: 'read',
    product: 'quran',
    tier: 0,
    description:
      'سورة واحدة من صفحة القرآن بآياتها المرقّمة، بوسيط surah (1 إلى 114) ووسيطَي from وto لآية البداية والنهاية. بلا from تبدأ من الآية الأولى، وبلا to تعيد ' +
      `${SURAH_VERSE_WINDOW} آية، فالسورة الطويلة تُقرأ على دفعات ويقول الجواب truncated إن بقي منها شيء.`,
    schema: SurahArgs,
    maxResultChars: 12_000,
    async run(args) {
      const input = SurahArgs.parse(args);
      const reading = await readSurah(input.surah, input.from, input.to);
      if (!reading) return { found: false };

      return {
        found: true,
        surah: { number: reading.number, name: reading.name },
        ayah_count: reading.ayahCount,
        from: reading.from,
        to: reading.to,
        verses: reading.verses,
        truncated: reading.truncated,
        next_from: reading.truncated ? reading.to + 1 : null,
      };
    },
  },
  {
    name: 'get_verse',
    kind: 'read',
    product: 'quran',
    tier: 0,
    description:
      'آية واحدة بمرجعها: surah رقم السورة وayah رقم الآية داخلها (كلتاهما تبدأ من 1). تعيد نصّ الآية واسم سورتها وعدد آياتها، فالإشارة مثل «البقرة 255» تُقرأ وحدها.',
    schema: VerseArgs,
    maxResultChars: 4_000,
    async run(args) {
      const input = VerseArgs.parse(args);
      const verse = await readVerse(input.surah, input.ayah);
      if (!verse) return { found: false };

      return {
        found: true,
        surah: verse.surah,
        ayah: verse.number,
        ayah_count: verse.ayahCount,
        text: verse.text,
      };
    },
  },
  {
    name: 'search_quran',
    kind: 'read',
    product: 'quran',
    tier: 0,
    description:
      'بحث نصّي في القرآن بمحرّك صفحة القرآن نفسه (لا فهرس ثانٍ): يعيد total عدد الآيات المطابقة وأول hits منها، كلٌّ برقم سورتها واسمها ورقم الآية ونصّها. البحث يتجاهل التشكيل ويقبل الصيغ الإملائية المختلفة.',
    schema: QuranSearchArgs,
    maxResultChars: 12_000,
    async run(args) {
      const input = QuranSearchArgs.parse(args);
      const limit = input.limit ?? 5;
      const { total, hits } = await searchQuran(input.query, limit);

      return {
        query: input.query,
        total,
        returned: hits.length,
        hits: hits.map((hit) => ({
          surah: hit.surah,
          ayah: hit.number,
          text: hit.text,
        })),
      };
    },
  },
  {
    name: 'list_athkar_sets',
    kind: 'read',
    product: 'athkar',
    tier: 0,
    description:
      'مجموعتا الأذكار في صفحة الأذكار: أذكار الصباح وأذكار المساء، لكلٍّ دورها واسمها وعدد أذكارها. اقرئيها لتختاري المجموعة التي يسأل عنها العضو.',
    schema: NoArgs,
    async run() {
      return { sets: await listAthkarSets() };
    },
  },
  {
    name: 'get_athkar',
    kind: 'read',
    product: 'athkar',
    tier: 0,
    description:
      'مجموعة أذكار كاملة بوسيط period (morning أو evening): عنوانها وأذكارها بترتيب الصفحة، لكلٍّ نصّه وعدد مرّاته وفضله إن ورد ومصدره من السنّة. النصّ يُنقل كما هو ولا يُفسَّر ولا يُستنبط منه حكم.',
    schema: AthkarArgs,
    maxResultChars: 12_000,
    async run(args) {
      const input = AthkarArgs.parse(args);
      const collection = await readAthkarSet(input.period);
      if (!collection) return { found: false };

      return {
        found: true,
        period: collection.period,
        title: collection.title,
        count: collection.items.length,
        items: collection.items.map((item) => ({
          id: item.id,
          text: item.text,
          repeat: item.repeat,
          virtue: item.virtue ?? null,
          source: item.source,
        })),
      };
    },
  },
  {
    name: 'get_scan_history',
    kind: 'read',
    product: 'scan',
    tier: 0,
    description:
      'آخر الرموز التي مسحها العضو بماسح الصفحة: نوع كل رمز (رابط، شبكة WiFi، رمز تحقّق بخطوتين، جهة اتصال…) والتسمية التي تعرّفه (مضيف الرابط أو اسم الشبكة أو اسم الجهة) وآخر يوم مسحه وعدد مرّاته. لا يعيد الرمز نفسه ولا أي كلمة سر أو مفتاح: السجل ملخّص لا نسخة.',
    schema: ScanHistoryArgs,
    maxResultChars: 8_000,
    async run(args, context) {
      const input = ScanHistoryArgs.parse(args);
      const entries = await createScanHistoryService(context.supabase).list(context.userId);
      const limit = input.limit ?? 20;

      return {
        count: entries.length,
        entries: entries.slice(0, limit).map((entry) => ({
          kind: entry.kind,
          kind_label: SCAN_HISTORY_KIND_LABELS[entry.kind],
          label: entry.label,
          last_seen_date: entry.lastSeenDate,
          seen_count: entry.seenCount,
        })),
        note:
          entries.length === 0
            ? 'لا سجل مسح بعد. يُحفظ الرمز في السجل بعد أن يمسحه العضو وهو مسجّل الدخول.'
            : null,
      };
    },
  },
  {
    name: 'create_post_draft',
    kind: 'write',
    product: 'community',
    tier: 1,
    description: 'إنشاء مسودة منشور في المجتمع بعنوان ونصّ.',
    schema: CreateDraftArgs,
    async run(args, context) {
      const input = CreateDraftArgs.parse(args);
      const id = crypto.randomUUID();
      const created = await createPostsRepository(context.supabase).createPost(context.userId, {
        slug: slugOf(input.meta_title, id),
        content: input.content,
        meta_title: input.meta_title,
      });
      return { post_id: created.id };
    },
  },
  {
    name: 'edit_post_draft',
    kind: 'write',
    product: 'community',
    tier: 1,
    description: 'تعديل نصّ مسودة منشور قائمة.',
    schema: EditDraftArgs,
    async run(args, context) {
      const input = EditDraftArgs.parse(args);
      const posts = createPostsRepository(context.supabase);
      const post = await posts.getPostForUser(input.post_id, context.userId);
      if (!post) return { error: 'لم أجد هذه المسودة' };
      if (post.status !== 'draft') return { error: 'لا يمكن تعديل منشور بعد نشره' };

      await posts.updatePost(input.post_id, context.userId, {
        slug: post.slug,
        content: input.content,
      });
      return { post_id: input.post_id };
    },
  },
  {
    name: 'publish_post_draft',
    kind: 'write',
    product: 'community',
    tier: 2,
    description: 'نشر مسودة منشور قائمة.',
    schema: PublishDraftArgs,
    async run(args, context) {
      const input = PublishDraftArgs.parse(args);
      const posts = createPostsRepository(context.supabase);
      const post = await posts.getPostForUser(input.post_id, context.userId);
      if (!post) return { error: 'لم أجد هذه المسودة' };
      if (post.status !== 'draft') return { error: 'هذا المنشور ليس مسودة' };

      const published = await posts.publishPost(input.post_id, context.userId);
      return { post_id: input.post_id, slug: published.slug };
    },
  },
  {
    name: 'record_expense',
    kind: 'write',
    product: 'spendtrack',
    tier: 1,
    description: 'تسجيل مصروف بمبلغ وتصنيف بالاسم.',
    schema: RecordExpenseArgs,
    async run(args, context) {
      const input = RecordExpenseArgs.parse(args);
      const categories = await categoriesByName(context);
      const categoryId = categories.get(input.category);
      if (!categoryId) return unknownCategory(input.category, categories);

      const id = await createSpendtrackService(context.supabase).createExpense(context.userId, {
        amount: input.amount,
        category_id: categoryId,
        date: input.date ?? damascusToday(),
        description: input.description ?? null,
        currency: input.currency ?? null,
      });
      return { expense_id: id };
    },
  },
  {
    name: 'edit_expense',
    kind: 'write',
    product: 'spendtrack',
    tier: 1,
    description: 'تعديل مبلغ مصروف أو تصنيفه.',
    schema: EditExpenseArgs,
    async run(args, context) {
      const input = EditExpenseArgs.parse(args);
      if (input.amount === undefined && !input.category) {
        return { error: 'لم يصل أي تعديل' };
      }

      const update: { amount?: number; category_id?: string } = {};
      if (input.amount !== undefined) update.amount = input.amount;
      if (input.category) {
        const categories = await categoriesByName(context);
        const categoryId = categories.get(input.category);
        if (!categoryId) return unknownCategory(input.category, categories);
        update.category_id = categoryId;
      }

      await createSpendtrackService(context.supabase).updateExpense(
        input.expense_id,
        context.userId,
        update
      );
      return { expense_id: input.expense_id };
    },
  },
  {
    name: 'create_habit',
    kind: 'write',
    product: 'habitflow',
    tier: 1,
    description: 'إنشاء عادة جديدة باسمها وتكرارها.',
    schema: CreateHabitArgs,
    async run(args, context) {
      const input = CreateHabitArgs.parse(args);
      const habit = await createHabitService(context.userId, context.supabase).service.createHabit({
        name: input.name,
        ...(input.frequency ? { frequency: input.frequency } : {}),
      });
      return { habit_id: habit.id, name: habit.name };
    },
  },
  {
    name: 'set_habit_reminder',
    kind: 'write',
    product: 'habitflow',
    tier: 1,
    description: 'ضبط تذكير عادة على وقت HH:mm، أو إزالته بوقت فارغ.',
    schema: HabitReminderArgs,
    async run(args, context) {
      const input = HabitReminderArgs.parse(args);
      const { service } = createHabitService(context.userId, context.supabase);
      const habits = await service.getAllHabits();
      const habit = habits.find((candidate) => candidate.name.trim() === input.habit_name.trim());
      if (!habit) return { error: 'لا توجد عادة بهذا الاسم' };

      await service.updateHabit(habit.id, { reminderTime: input.reminder_time });
      return { habit_id: habit.id, reminder_time: input.reminder_time };
    },
  },
  {
    name: 'book_consultation',
    kind: 'write',
    product: 'consultations',
    tier: 2,
    description: 'حجز استشارة بباقة ومواعيد وبيانات التواصل.',
    schema: BookConsultationArgs,
    async run(args, context) {
      const input = BookConsultationArgs.parse(args);
      const booking = await createPublicConsultationService().createBooking(input, {
        userId: context.userId,
        ip: context.ip,
      });
      return { booking_id: booking.id, reference_code: booking.referenceCode };
    },
  },
  {
    name: 'apply_training',
    kind: 'write',
    product: 'training',
    tier: 2,
    description: 'تقديم طلب التحاق بدورة تدريبية.',
    schema: ApplyTrainingArgs,
    async run(args, context) {
      const input = ApplyTrainingArgs.parse(args);
      const application = await createDefaultTrainingApplicationService().submit(input, {
        userId: context.userId,
        ip: context.ip,
      });
      return { application_id: application.id };
    },
  },
  {
    name: 'submit_project_request',
    kind: 'write',
    product: 'client-work',
    tier: 2,
    description: 'إرسال طلب مشروع بوصفه وبيانات التواصل.',
    schema: ProjectRequestArgs,
    async run(args, context) {
      const input = ProjectRequestArgs.parse(args);
      const request = await createDefaultProjectRequestService().submit(input, {
        userId: context.userId,
        ip: context.ip,
      });
      return { request_id: request.id };
    },
  },
  {
    name: 'change_display_name',
    kind: 'write',
    product: 'account',
    tier: 1,
    description: 'تغيير اسم العرض فقط؛ لا بريد ولا كلمة مرور ولا حذف حساب.',
    schema: ChangeNameArgs,
    async run(args, context) {
      const input = ChangeNameArgs.parse(args);
      const updated = await createProfileService(context.supabase).updateName(
        context.userId,
        input.name
      );
      return { name: updated.name };
    },
  },
  {
    name: 'remember',
    kind: 'write',
    product: 'account',
    tier: 1,
    description:
      'حفظ أمر يطلب العضو أن يتذكّره نور في وقت لاحق: تفضيل أو قرار أو معلومة عنه. لا يحفظ كلمة مرور ولا رمزاً ولا بيانات بطاقة. استخدمه حين يقول «تذكّر» أو «احفظ»، ولا تدّعِ التذكّر دون استدعائه.',
    schema: RememberArgs,
    async run(args, context) {
      const input = RememberArgs.parse(args);
      const memory = await createAgentMemoryFor(context.supabase).remember({
        userId: context.userId,
        text: input.text,
        ...(input.kind ? { kind: input.kind } : {}),
      });
      return { memory_id: memory.id, text: memory.text };
    },
  },
  {
    name: 'list_specialists',
    kind: 'read',
    product: 'assistant',
    tier: 0,
    description:
      'دليل المتخصصين: بلا وسيط يعرض الأقسام وعدد المتخصصين في كل قسم، وبوسيط division يعرض متخصصي ذلك القسم بأسمائهم ووصفهم. استخدمه حين يحتاج السؤال خبرة أضيق من العامة، ثم حمّل المتخصص المناسب.',
    schema: ListSpecialistsArgs,
    async run(args) {
      const input = ListSpecialistsArgs.parse(args);
      return listAgencySkills(input.division);
    },
  },
  {
    name: 'load_specialist',
    kind: 'read',
    product: 'assistant',
    tier: 0,
    description:
      'تحميل تعليمات متخصص من الدليل بمعرّفه، لتتبعها في بقية الجواب. خذه من قائمة المرشّحين التي تصل مع السؤال أو من list_specialists، ولا تخترع معرّفاً، ولا تحمّل أكثر من متخصص واحد في الجولة.',
    schema: LoadSpecialistArgs,
    maxResultChars: 20_000,
    async run(args) {
      const input = LoadSpecialistArgs.parse(args);
      return loadAgencySkill(input.id);
    },
  },
  {
    name: 'search_web',
    kind: 'read',
    product: 'assistant',
    tier: 0,
    description:
      'البحث في الويب عن معلومة ليست في بياناتنا ولا في معرفتك، أو تتغيّر بمرور الوقت، أو يطلب العضو مصدرها. اكتب استعلاماً قصيراً بلغة السؤال، ولا تكتب فيه أي معلومة شخصية عن العضو. قدّم بيانات العضو وأدواتنا على البحث، واستشهد بما تقرأه برقم المصدر بين قوسين.',
    schema: SearchWebArgs,
    maxResultChars: 6_500,
    async run(args, context) {
      const input = SearchWebArgs.parse(args);
      if (!context.searchWeb) throw new Error(WEB_SEARCH_UNAVAILABLE);
      const result = await context.searchWeb(input.query);
      return {
        // The full sources go back with the evidence: the card on the message
        // needs the URL and the date the model does not. They are small beside
        // the text, and one array is the one truth for both readers.
        sources: result.sources,
        evidence: result.evidence,
        ...(result.sources.length === 0 ? { note: 'لم أجد نتيجة في الويب لهذا الاستعلام.' } : {}),
      };
    },
  },
  {
    name: 'find_app_tools',
    kind: 'read',
    product: 'assistant',
    tier: 0,
    description:
      'البحث في أدوات التطبيقات التي ربطها العضو. استخدمها حين يطلب شيئاً من تطبيق خارجي ولم تجد أداته بين أدواتك؛ تعيد أسماء الأدوات المطابقة لتستدعيها في الخطوة التالية.',
    schema: FindAppToolsArgs,
    async run(args, context) {
      const input = FindAppToolsArgs.parse(args);
      if (!context.findAppTools) return { tools: [] };
      return { tools: await context.findAppTools(input.query) };
    },
  },
  {
    name: 'get_screen_context',
    kind: 'read',
    product: 'assistant',
    tier: 0,
    description:
      'حالة الشاشة التي يسأل منها العضو، كما وصلت من صفحته مع سؤاله. الحالة التي في أول المحادثة هي الأصل؛ استخدمها حين تحتاج تفصيلاً لم يعد أمامك فيه، ولا تسألي العضو أين هو.',
    schema: NoArgs,
    async run(_args, context) {
      // No snapshot, no answer: the tool is not declared without one, so this
      // is a caller that asked anyway rather than a page with nothing to say.
      if (!context.screen) return { screen: null, updatedAt: null };
      return screenContextAnswer(context.screen);
    },
  },
];

const byName = new Map<string, ChatAgentTool>(tools.map((tool) => [tool.name, tool]));

export function chatAgentTool(name: string): ChatAgentTool | null {
  return byName.get(name) ?? null;
}

export function chatAgentTools(): readonly ChatAgentTool[] {
  return tools;
}

/** What the provider is sent: the OpenAI-compatible function declarations. */
export function chatAgentToolDefinitions(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toJsonSchema(tool.schema),
    },
  }));
}

/**
 * The first-party declarations a turn carries.
 *
 * Three are conditional, for the same reason: a tool that promises something
 * the turn does not have is an invitation to waste a round.
 *
 * `find_app_tools` needs a connected app, because a member with no app has
 * nothing to find. `get_screen_context` needs the snapshot the request brought
 * (ADR-0181, decision 7): a client with no eyes — an older tab, an opted-out
 * surface, the admin area — is a turn where the tool would answer "nothing"
 * after costing a round. `search_web` needs a search key (ADR-0205): a
 * deployment without one declares no web at all. Every other tool is always
 * declared.
 */
export function chatAgentToolDefinitionsForTurn(input: {
  hasApps: boolean;
  hasScreen: boolean;
  hasWebSearch: boolean;
}): ReturnType<typeof chatAgentToolDefinitions> {
  return chatAgentToolDefinitions().filter((definition) => {
    if (definition.function.name === 'find_app_tools') return input.hasApps;
    if (definition.function.name === 'get_screen_context') return input.hasScreen;
    if (definition.function.name === 'search_web') return input.hasWebSearch;
    return true;
  });
}

/**
 * Zod's own JSON Schema. A schema Zod cannot express is answered with an empty
 * object rather than taking the whole turn down — the confirm step validates
 * the arguments again, so nothing unsafe rides on this shape.
 */
function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  try {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any',
    }) as Record<string, unknown> & { $schema?: string };
    // `$schema` is metadata for a validator, not part of a declaration: strict
    // compatibility layers refuse a function that carries it.
    return parameters;
  } catch {
    return { type: 'object', properties: {}, additionalProperties: false };
  }
}
