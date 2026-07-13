import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollAnimation } from '../ScrollAnimations';

describe('ScrollAnimation', () => {
  it('renders children correctly', () => {
    render(
      <ScrollAnimation animation="slide-up">
        <div data-testid="child">Hello</div>
      </ScrollAnimation>
    );
    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('renders with correct default tag', () => {
    const { container } = render(
      <ScrollAnimation animation="slide-up">
        <p>Content</p>
      </ScrollAnimation>
    );
    expect(container.querySelector('div')).toBeInTheDocument();
  });
});
