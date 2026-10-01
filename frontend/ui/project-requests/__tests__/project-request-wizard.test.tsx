import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProjectRequestWizard } from '../project-request-wizard';

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

describe('ProjectRequestWizard', () => {
  it('starts on the type step with Next gated until a type is chosen', () => {
    render(<ProjectRequestWizard />);

    expect(screen.getByText('نوع المشروع')).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /موقع/ }));
    expect(nextButton()).not.toBeDisabled();
  });

  it('advances to the details step once a type is chosen', async () => {
    render(<ProjectRequestWizard />);

    fireEvent.click(screen.getByRole('radio', { name: /تطبيق/ }));
    fireEvent.click(nextButton());

    expect(await screen.findByLabelText(/وصف المشروع/)).toBeInTheDocument();
  });

  it('gates the details step on the description floor', async () => {
    render(<ProjectRequestWizard />);

    fireEvent.click(screen.getByRole('radio', { name: /موقع/ }));
    fireEvent.click(nextButton());
    await screen.findByLabelText(/وصف المشروع/);

    expect(nextButton()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/وصف المشروع/), {
      target: { value: 'ا'.repeat(30) },
    });

    await waitFor(() => expect(nextButton()).not.toBeDisabled());
  });
});
