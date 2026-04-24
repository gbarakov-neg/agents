import { describe, it, expect } from 'vitest';
import { agentColor } from '../agentColor';

describe('agentColor', () => {
  it('returns stable values for the same input', () => {
    expect(agentColor('arch-42')).toEqual(agentColor('arch-42'));
  });
  it('returns different colors for different inputs (usually)', () => {
    const a = agentColor('aaa');
    const b = agentColor('zzz');
    expect(a.dot).not.toBe(b.dot);
  });
  it('has three fields: bg, fg, dot', () => {
    const c = agentColor('x');
    expect(typeof c.bg).toBe('string');
    expect(typeof c.fg).toBe('string');
    expect(typeof c.dot).toBe('string');
  });
});
