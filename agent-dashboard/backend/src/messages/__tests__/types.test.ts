import { describe, it, expect } from 'vitest';
import type { Message, PlanProposalItem } from '../types';

describe('Message types', () => {
  it('accepts a text message', () => {
    const m: Message = {
      id: 'x', role: 'user', kind: 'text',
      content: 'hi', createdAt: new Date().toISOString(),
    };
    expect(m.kind).toBe('text');
  });

  it('accepts a plan_proposal with pending approval', () => {
    const item: PlanProposalItem = {
      id: 'i1', title: 't', priority: 'high',
    };
    const m: Message = {
      id: 'x', role: 'assistant', kind: 'plan_proposal',
      summary: 's', items: [item], approval: 'pending',
      createdAt: new Date().toISOString(),
    };
    expect(m.items[0].priority).toBe('high');
  });

  it('accepts an execution_status linked to a plan', () => {
    const m: Message = {
      id: 'x', role: 'system', kind: 'execution_status',
      planMessageId: 'p1', phase: 'planning', status: 'started',
      createdAt: new Date().toISOString(),
    };
    expect(m.planMessageId).toBe('p1');
  });
});
