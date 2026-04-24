import { describe, it, expect } from 'vitest';
import { MessageStore } from '../store';
import type { Message } from '../types';

describe('MessageStore persistence', () => {
  it('round-trips a mixed-kind thread through snapshot/loadSnapshot', () => {
    const a = new MessageStore();
    const textMsg: Message = {
      id: 't1', role: 'user', kind: 'text',
      content: 'hello', createdAt: '2026-04-22T10:00:00Z',
    };
    const planMsg: Message = {
      id: 'p1', role: 'assistant', kind: 'plan_proposal',
      summary: 's', items: [{ id: 'i1', title: 'T', priority: 'high' }],
      approval: 'approved', approvedItemIds: ['i1'],
      createdAt: '2026-04-22T10:01:00Z',
    };
    const execMsg: Message = {
      id: 'e1', role: 'system', kind: 'execution_status',
      planMessageId: 'p1', phase: 'planning', status: 'completed',
      createdAt: '2026-04-22T10:02:00Z',
    };
    a.append('team-A', textMsg);
    a.append('team-A', planMsg);
    a.append('team-A', execMsg);
    a.append('team-B', textMsg);

    const snap = a.snapshot();

    const b = new MessageStore();
    b.loadSnapshot(snap);
    expect(b.get('team-A')).toHaveLength(3);
    expect(b.get('team-B')).toHaveLength(1);
    const restoredPlan = b.findById('team-A', 'p1');
    expect(restoredPlan?.kind).toBe('plan_proposal');
    if (restoredPlan?.kind === 'plan_proposal') {
      expect(restoredPlan.approval).toBe('approved');
      expect(restoredPlan.approvedItemIds).toEqual(['i1']);
    }
  });
});
