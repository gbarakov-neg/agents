import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('frontend test harness', () => {
  it('renders JSX', () => {
    render(<span>hello</span>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
