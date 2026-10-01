import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { RetainerRequestWizard } from '../retainer-request-wizard';

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

const nextButton = () => screen.getByRole('button', { name: /التَّالي/ });

describe('RetainerRequestWizard', () => {
  it('starts on the projects step with Next gated until the projects floor is met', async () => {
    render(<RetainerRequestWizard />);

    expect(screen.getByText('مشاريعك')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/المشاريع التي لديك/), {
      target: { value: 'ا'.repeat(30) },
    });

    await waitFor(() => expect(nextButton()).not.toBeDisabled());
  });

  it('advances to the needs step once the projects floor is met', async () => {
    render(<RetainerRequestWizard />);

    fireEvent.change(screen.getByLabelText(/المشاريع التي لديك/), {
      target: { value: 'ا'.repeat(30) },
    });
    await waitFor(() => expect(nextButton()).not.toBeDisabled());
    fireEvent.click(nextButton());

    expect(await screen.findByLabelText(/ما تحتاج صيانته أو تطويره/)).toBeInTheDocument();
  });

  it('gates the needs step on its own floor', async () => {
    render(<RetainerRequestWizard />);

    fireEvent.change(screen.getByLabelText(/المشاريع التي لديك/), {
      target: { value: 'ا'.repeat(30) },
    });
    await waitFor(() => expect(nextButton()).not.toBeDisabled());
    fireEvent.click(nextButton());
    await screen.findByLabelText(/ما تحتاج صيانته أو تطويره/);

    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/ما تحتاج صيانته أو تطويره/), {
      target: { value: 'ب'.repeat(30) },
    });

    await waitFor(() => expect(nextButton()).not.toBeDisabled());
  });
});
