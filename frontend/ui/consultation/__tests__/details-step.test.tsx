import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { DetailsStep } from '../steps/details-step';
import { arabicCharCountNoun, TOPIC_DESCRIPTION_MIN } from '@/shared/contracts/consultation';
import type { BookingContactDraft } from '@/frontend/state/consultation/use-booking-flow';

const emptyContact: BookingContactDraft = {
  full_name: '',
  phone_whatsapp: '',
  topic_description: '',
};

function renderStep(overrides: Partial<React.ComponentProps<typeof DetailsStep>> = {}) {
  return render(
    <DetailsStep
      contact={emptyContact}
      onChange={vi.fn()}
      onBlurField={vi.fn()}
      fieldErrors={{}}
      {...overrides}
    />
  );
}

const topicField = () => screen.getByLabelText(/موضوع الاستشارة/) as HTMLTextAreaElement;

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('DetailsStep topic field', () => {
  it('shows the minimum-length hint before the user types', () => {
    renderStep();
    const hint = document.getElementById('booking-topic-hint');
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent(
      `${TOPIC_DESCRIPTION_MIN} ${arabicCharCountNoun(TOPIC_DESCRIPTION_MIN)} على الأقل`
    );
  });

  it('links the topic field to the hint for assistive tech', () => {
    renderStep();
    expect(topicField()).toHaveAttribute('aria-describedby', 'booking-topic-hint');
  });

  it('validates the topic on blur', () => {
    const onBlurField = vi.fn();
    renderStep({ onBlurField });
    fireEvent.blur(topicField());
    expect(onBlurField).toHaveBeenCalledWith('topic_description');
  });

  it('surfaces the inline error and points the field at it', () => {
    const message = `اشرح موضوع الاستشارة بما لا يقل عن ${TOPIC_DESCRIPTION_MIN} ${arabicCharCountNoun(
      TOPIC_DESCRIPTION_MIN
    )}`;
    renderStep({ fieldErrors: { topic_description: message } });

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(topicField()).toHaveAttribute('aria-invalid', 'true');
    expect(topicField().getAttribute('aria-describedby')).toContain('booking-topic-error');
  });
});
