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
import { listAgencySkills, loadAgencySkill } from '@/backend/services/chat/agency-skills';
import { toPublicCertificate } from '@/shared/contracts/certificates';
import { PostSlugSchema } from '@/shared/contracts/community';
import { COURSE_SLUGS } from '@/shared/contracts/training';
import {
  PROJECT_REQUEST_TYPES,
  PROJECT_REQUEST_BUDGET_RANGES,
  PROJECT_REQUEST_TIMELINES,
} from '@/shared/contracts/project-requests';
import { ProfileNameSchema } from '@/shared/contracts/users';
import { whatsappPhoneRegex } from '@/shared/contracts/phone';
import type { ChatAgentToolKind, ChatAgentToolName } from '@/shared/contracts/chat-agent-actions';

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
 * - **A write runs only on confirmation.** A `write` tool is never called from
 *   the turn; the turn only proposes it, and `confirm` is the one caller of
 *   `run`. The read tools are the only ones whose answer reaches the model.
 */

export interface ChatAgentToolContext {
  /** The caller, injected by the server. */
  userId: string;
  /** The caller's own session client: policies apply to everything it does. */
  supabase: SupabaseClient<Database>;
  /** The caller's address, for the services that rate-limit a submission. */
  ip: string;
}

export interface ChatAgentTool {
  name: ChatAgentToolName;
  kind: ChatAgentToolKind;
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

const tools: ChatAgentTool[] = [
  // --- reads ---------------------------------------------------------------
  {
    name: 'list_certificates',
    kind: 'read',
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
    description: 'خطة العضو واستخدامه لما تسمح به الخطة.',
    schema: NoArgs,
    async run(_args, context) {
      return createUsageService().state(context.userId);
    },
  },
  {
    name: 'list_consultation_bookings',
    kind: 'read',
    description: 'حجوزات الاستشارة الخاصة بالعضو وحالتها.',
    schema: NoArgs,
    async run(_args, context) {
      return createPublicConsultationService().listMyBookings(context.userId);
    },
  },
  {
    name: 'list_consultation_options',
    kind: 'read',
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
    name: 'create_post_draft',
    kind: 'write',
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
    name: 'list_specialists',
    kind: 'read',
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
    description:
      'تحميل تعليمات متخصص من الدليل بمعرّفه، لتتبعها في بقية الجواب. خذه من list_specialists، ولا تخترع معرّفاً.',
    schema: LoadSpecialistArgs,
    maxResultChars: 20_000,
    async run(args) {
      const input = LoadSpecialistArgs.parse(args);
      return loadAgencySkill(input.id);
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
