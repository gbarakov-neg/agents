import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageThread from '../MessageThread';
import type { Message } from '../../types';

const now = () => new Date().toISOString();

describe('MessageThread', () => {
  it('renders text messages', () => {
    const msgs: Message[] = [
      { id: '1', role: 'user', kind: 'text', content: 'hi there', createdAt: now() },
      { id: '2', role: 'assistant', kind: 'text', content: 'hello', createdAt: now() },
    ];
    render(<MessageThread messages={msgs} onApprove={() => Promise.resolve()} />);
    expect(screen.getByText('hi there')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('renders plan proposals inline', () => {
    const msgs: Message[] = [
      {
        id: 'p1', role: 'assistant', kind: 'plan_proposal',
        summary: 'do three', items: [{ id: 'x', title: 'Task', priority: 'medium' }],
        approval: 'pending', createdAt: now(),
      },
    ];
    render(<MessageThread messages={msgs} onApprove={() => Promise.resolve()} />);
    expect(screen.getByText('do three')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
  });

  it('renders execution_status rows after their plan', () => {
    const msgs: Message[] = [
      {
        id: 'p1', role: 'assistant', kind: 'plan_proposal',
        summary: 's', items: [{ id: 'x', title: 'T', priority: 'low' }],
        approval: 'approved', approvedItemIds: ['x'], createdAt: now(),
      },
      {
        id: 'e1', role: 'system', kind: 'execution_status',
        planMessageId: 'p1', phase: 'planning', status: 'started',
        agentId: 'a1', createdAt: now(),
      },
    ];
    render(<MessageThread messages={msgs} onApprove={() => Promise.resolve()} />);
    expect(screen.getByText(/planning/)).toBeInTheDocument();
  });
});
