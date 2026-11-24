import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { toolsDepsFor } from '@/backend/services/chat/__tests__/support/tools-deps';
import type { ConsultationBooking } from '@/shared/contracts/consultation';
import type { TrainingApplication, TrainingCohort } from '@/shared/contracts/training';
import type { ProjectRequest } from '@/shared/contracts/project-requests';

/**
 * The three intake products' hands (issue #1434).
 *
 * Consultations already had its two reads and its booking card; this completes
 * the cancellation and adds the training/client-work reads. The reads are
 * scoped by the session user, and the cancellation is a tier-3 card whose typed
 * target names the booking.
 */

// Product-service fakes, handed to the catalogue through `ChatAgentToolsDeps`.
const createPublicConsultationService = vi.fn();
const createDefaultTrainingApplicationService = vi.fn();
const createDefaultTrainingCohortsRepository = vi.fn();
const createDefaultProjectRequestService = vi.fn();
const deps = toolsDepsFor({
  consultation: { createService: createPublicConsultationService },
  training: {
    createApplicationService: createDefaultTrainingApplicationService,
    createCohortsRepository: createDefaultTrainingCohortsRepository,
  },
  projectRequests: { createService: createDefaultProjectRequestService },
});

function turnContext(): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', deps };
}

const booking: ConsultationBooking = {
  id: '11111111-1111-4111-8111-111111111111',
  reference_code: 'CONS-2026-A1B2C3D4',
  user_id: 'user-1',
  package_id: '22222222-2222-4222-8222-222222222222',
  package_name: 'باقة',
  full_name: 'ريم',
  phone_whatsapp: '+963968478904',
  email: null,
  topic_description: 'موضوع الاستشارة بما يكفي من الحروف.',
  status: 'pending',
  confirmed_at: null,
  rejected_reason: null,
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  edited_at: null,
  sessions: [],
};

const application: TrainingApplication = {
  id: '33333333-3333-4333-8333-333333333333',
  course_slug: 'build-digital-products',
  full_name: 'ريم',
  phone_whatsapp: '+963968478904',
  goal: null,
  reference_code: 'TRN-2026-A1B2C3D4',
  status: 'contacted',
  cohort_id: null,
  notes: null,
  user_id: 'user-1',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  edited_at: null,
};

const cohort: TrainingCohort = {
  id: '44444444-4444-4444-8444-444444444444',
  course_slug: 'build-digital-products',
  label: 'الدُّفعة الأولى',
  starts_at: '2026-12-01T00:00:00.000Z',
  capacity: 10,
  seats_taken: 3,
  status: 'open',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
};

const request: ProjectRequest = {
  id: '55555555-5555-4555-8555-555555555555',
  full_name: 'ريم',
  phone_whatsapp: '+963968478904',
  email: null,
  project_type: 'website',
  description: 'مشروع موقع تعريفي بما يكفي من الحروف.',
  budget_range: null,
  timeline: null,
  existing_url: null,
  reference_code: 'PRJ-2026-A1B2C3D4',
  status: 'quoted',
  notes: null,
  user_id: 'user-1',
  created_at: '2026-11-01T00:00:00.000Z',
  updated_at: '2026-11-01T00:00:00.000Z',
  edited_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('consultation cancellation (issue #1434)', () => {
  it('is a tier-3 write whose card names the booking', () => {
    const tool = chatAgentTool('cancel_consultation')!;
    expect(tool.kind).toBe('write');
    expect(tool.tier).toBe(3);
    expect(tool.description).toContain('الحجز');
  });

  it('cancels the named booking as the member’s own', async () => {
    const cancelMyBooking = vi.fn(async () => ({ ...booking, status: 'cancelled' }));
    vi.mocked(createPublicConsultationService).mockReturnValue({ cancelMyBooking } as never);

    const answer = await chatAgentTool('cancel_consultation')!.run(
      { booking_id: booking.id, name: booking.reference_code },
      turnContext()
    );

    expect(cancelMyBooking).toHaveBeenCalledWith('user-1', booking.id, booking.reference_code);
    expect(answer).toEqual({
      booking_id: booking.id,
      reference_code: booking.reference_code,
      status: 'cancelled',
    });
  });

  it('refuses arguments that do not carry the target', () => {
    expect(
      chatAgentTool('cancel_consultation')!.schema.safeParse({ booking_id: booking.id }).success
    ).toBe(false);
  });
});

describe('the training and client-work reads (issue #1434)', () => {
  it('answers my applications with their status, scoped to the caller', async () => {
    const listMine = vi.fn(async () => [application]);
    vi.mocked(createDefaultTrainingApplicationService).mockReturnValue({ listMine } as never);

    const answer = await chatAgentTool('list_training_applications')!.run({}, turnContext());

    expect(listMine).toHaveBeenCalledWith('user-1');
    expect(answer).toEqual([expect.objectContaining({ status: 'contacted' })]);
  });

  it('answers the open cohorts with the seats a student can still claim', async () => {
    const list = vi.fn(async () => [cohort]);
    vi.mocked(createDefaultTrainingCohortsRepository).mockReturnValue({ list } as never);

    const answer = (await chatAgentTool('list_training_cohorts')!.run({}, turnContext())) as Array<
      TrainingCohort & { seats_left: number }
    >;

    expect(list).toHaveBeenCalledWith({ status: 'open' });
    expect(answer[0]?.seats_left).toBe(7);
  });

  it('answers my project requests with their status, scoped to the caller', async () => {
    const listMine = vi.fn(async () => [request]);
    vi.mocked(createDefaultProjectRequestService).mockReturnValue({ listMine } as never);

    const answer = await chatAgentTool('list_project_requests')!.run({}, turnContext());

    expect(listMine).toHaveBeenCalledWith('user-1');
    expect(answer).toEqual([expect.objectContaining({ status: 'quoted' })]);
  });
});
