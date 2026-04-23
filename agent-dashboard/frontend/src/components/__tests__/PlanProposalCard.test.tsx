import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlanProposalCard from '../PlanProposalCard';
import type { Message } from '../../types';

const basePlan: Extract<Message, { kind: 'plan_proposal' }> = {
  id: 'p1', role: 'assistant', kind: 'plan_proposal',
  summary: 'do things',
  items: [
    { id: 'a', title: 'Fix nav', priority: 'high' },
    { id: 'b', title: 'Compress images', priority: 'low' },
  ],
  approval: 'pending',
  createdAt: new Date().toISOString(),
};

describe('PlanProposalCard', () => {
  it('renders summary and items', () => {
    render(<PlanProposalCard plan={basePlan} onResolve={() => Promise.resolve()} />);
    expect(screen.getByText('do things')).toBeInTheDocument();
    expect(screen.getByText('Fix nav')).toBeInTheDocument();
    expect(screen.getByText(/HIGH/i)).toBeInTheDocument();
  });

  it('approve posts only selected itemIds', async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    render(<PlanProposalCard plan={basePlan} onResolve={spy} />);
    const user = userEvent.setup();
    const firstBox = screen.getByLabelText(/Fix nav/);
    await user.click(firstBox);
    await user.click(screen.getByRole('button', { name: /approve selected/i }));
    expect(spy).toHaveBeenCalledWith(['a']);
  });

  it('decline posts empty itemIds', async () => {
    const spy = vi.fn().mockResolvedValue(undefined);
    render(<PlanProposalCard plan={basePlan} onResolve={spy} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /decline/i }));
    expect(spy).toHaveBeenCalledWith([]);
  });

  it('locks when already approved', () => {
    const approved = { ...basePlan, approval: 'approved' as const, approvedItemIds: ['a'] };
    render(<PlanProposalCard plan={approved} onResolve={() => Promise.resolve()} />);
    expect(screen.getByRole('button', { name: /approve selected/i })).toBeDisabled();
    expect(screen.getByText(/approved/i)).toBeInTheDocument();
  });
});
