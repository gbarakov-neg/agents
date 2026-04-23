import { describe, it, expect, beforeEach } from 'vitest';
import { MessageStore, AlreadyResolvedError, NotFoundError, InvalidItemsError } from '../store';
import type { Message } from '../types';

const makeProposal = (): Extract<Message, { kind: 'plan_proposal' }> => ({
  id: 'p1',
  role: 'assistant',
  kind: 'plan_proposal',
  summary: 's',
  items: [
    { id: 'a', title: 'A', priority: 'high' },
    { id: 'b', title: 'B', priority: 'low' },
  ],
  approval: 'pending',
  createdAt: new Date().toISOString(),
});

describe('MessageStore', () => {
  let store: MessageStore;
  beforeEach(() => { store = new MessageStore(); });

  it('appends and retrieves', () => {
    store.append('t1', makeProposal());
    expect(store.get('t1')).toHaveLength(1);
    expect(store.get('t2')).toEqual([]);
  });

  it('finds by id', () => {
    const p = makeProposal();
    store.append('t1', p);
    expect(store.findById('t1', 'p1')?.id).toBe('p1');
    expect(store.findById('t1', 'nope')).toBeUndefined();
  });

  it('approves selected items', () => {
    store.append('t1', makeProposal());
    store.applyApproval('t1', 'p1', ['a']);
    const m = store.findById('t1', 'p1') as Extract<Message, { kind: 'plan_proposal' }>;
    expect(m.approval).toBe('approved');
    expect(m.approvedItemIds).toEqual(['a']);
  });

  it('declines when itemIds is empty', () => {
    store.append('t1', makeProposal());
    store.applyApproval('t1', 'p1', []);
    const m = store.findById('t1', 'p1') as Extract<Message, { kind: 'plan_proposal' }>;
    expect(m.approval).toBe('declined');
    expect(m.approvedItemIds).toEqual([]);
  });

  it('rejects unknown itemIds', () => {
    store.append('t1', makeProposal());
    expect(() => store.applyApproval('t1', 'p1', ['zzz'])).toThrow(InvalidItemsError);
  });

  it('rejects double-approve', () => {
    store.append('t1', makeProposal());
    store.applyApproval('t1', 'p1', ['a']);
    expect(() => store.applyApproval('t1', 'p1', ['b'])).toThrow(AlreadyResolvedError);
  });

  it('rejects unknown msg or wrong kind', () => {
    expect(() => store.applyApproval('t1', 'nope', [])).toThrow(NotFoundError);

    const textMsg: Message = {
      id: 't2x', role: 'user', kind: 'text',
      content: 'hi', createdAt: new Date().toISOString(),
    };
    store.append('t1', textMsg);
    expect(() => store.applyApproval('t1', 't2x', [])).toThrow(NotFoundError);
  });
});
