import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FormWizard } from '../form-wizard';

const STEPS = [
  { key: 'a', label: 'الخطوة أ' },
  { key: 'b', label: 'الخطوة ب' },
];

function renderWizard(overrides: Partial<React.ComponentProps<typeof FormWizard>> = {}) {
  const props: React.ComponentProps<typeof FormWizard> = {
    steps: STEPS,
    currentIndex: 0,
    ariaLabel: 'خطوات',
    canProceed: true,
    confirmLabel: 'تأكيد',
    submittingLabel: 'جاري الإرسال...',
    onBack: vi.fn(),
    onNext: vi.fn(),
    onConfirm: vi.fn(),
    children: <div>body</div>,
    ...overrides,
  };
  render(<FormWizard {...props} />);
  return props;
}

describe('FormWizard', () => {
  it('renders every step label and marks the current step', () => {
    renderWizard({ currentIndex: 1 });

    expect(screen.getByText('الخطوة أ')).toBeInTheDocument();
    expect(screen.getByText('الخطوة ب').closest('[aria-current]')).toHaveAttribute(
      'aria-current',
      'step'
    );
  });

  it('disables Back on the first step and enables it afterwards', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /السَّابق/ })).toBeDisabled();
  });

  it('enables Back once the user is past the first step', () => {
    renderWizard({ currentIndex: 1 });
    expect(screen.getByRole('button', { name: /السَّابق/ })).toBeEnabled();
  });

  it('calls onBack when Back is pressed', () => {
    const props = renderWizard({ currentIndex: 1 });
    fireEvent.click(screen.getByRole('button', { name: /السَّابق/ }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('gates Next on canProceed', () => {
    renderWizard({ canProceed: false });
    expect(screen.getByRole('button', { name: /التَّالي/ })).toBeDisabled();
  });

  it('calls onNext when Next is pressed', () => {
    const props = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /التَّالي/ }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('shows the confirm button on the last step and calls onConfirm', () => {
    const props = renderWizard({ currentIndex: STEPS.length - 1 });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the submitting label and blocks both actions while submitting', () => {
    renderWizard({ currentIndex: STEPS.length - 1, submitting: true });

    expect(screen.getByRole('button', { name: /جاري الإرسال/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /السَّابق/ })).toBeDisabled();
  });

  it('surfaces a form-level error', () => {
    renderWizard({ error: 'تعذر الإرسال' });
    expect(screen.getByRole('alert')).toHaveTextContent('تعذر الإرسال');
  });
});
