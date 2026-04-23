import { describe, it, expect } from 'vitest';
import { extractPlanProposal } from '../parser';

describe('extractPlanProposal', () => {
  it('returns null for plain prose', () => {
    expect(extractPlanProposal('just talking here')).toBeNull();
  });

  it('parses a fenced json block', () => {
    const text = 'Here is my plan:\n```json\n' + JSON.stringify({
      kind: 'plan_proposal',
      summary: 'Do three things',
      items: [
        { id: 'a', title: 'A', priority: 'high' },
        { id: 'b', title: 'B', priority: 'medium' },
      ],
    }) + '\n```';
    const result = extractPlanProposal(text);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Do three things');
    expect(result?.items).toHaveLength(2);
  });

  it('returns null on missing summary', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal',
      items: [{ id: 'a', title: 'A', priority: 'high' }],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });

  it('returns null on empty items', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's', items: [],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });

  it('returns null on duplicate item ids', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [
        { id: 'a', title: 'A', priority: 'high' },
        { id: 'a', title: 'B', priority: 'low' },
      ],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });

  it('returns null on invalid priority', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [{ id: 'a', title: 'A', priority: 'urgent' }],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });

  it('returns null on malformed json', () => {
    expect(extractPlanProposal('```json\n{not json}\n```')).toBeNull();
  });
});
