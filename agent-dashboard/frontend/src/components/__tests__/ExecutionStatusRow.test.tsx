import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionStatusRow from '../ExecutionStatusRow';

describe('ExecutionStatusRow', () => {
  const base = {
    id: 'e1', role: 'system' as const, kind: 'execution_status' as const,
    planMessageId: 'p1', phase: 'planning',
    createdAt: new Date().toISOString(),
  };

  it('shows phase and status', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'started', agentId: 'a-42' }} />);
    expect(screen.getByText(/planning/)).toBeInTheDocument();
    expect(screen.getByText(/started/i)).toBeInTheDocument();
  });

  it('shows a pulsing dot when status is progress', () => {
    const { container } = render(
      <ExecutionStatusRow msg={{ ...base, status: 'progress', agentId: 'a' }} />
    );
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows a check glyph when completed', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'completed', agentId: 'a' }} />);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });

  it('shows a cross glyph when failed', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'failed', agentId: 'a' }} />);
    expect(screen.getByText(/✗/)).toBeInTheDocument();
  });
});
