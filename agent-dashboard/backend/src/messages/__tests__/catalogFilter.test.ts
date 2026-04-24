import { describe, it, expect } from 'vitest';
import { filterCatalog } from '../catalogFilter';

const big = Array.from({ length: 120 }, (_, i) => ({
  name: `role-${i}`,
  description: `description of role ${i}`,
}));

describe('filterCatalog', () => {
  it('always includes core roles even with zero keyword matches', () => {
    const core = ['product-owner', 'backend-architect', 'frontend-developer',
                  'code-reviewer', 'security-auditor', 'test-automator'];
    const catalog = [
      ...core.map(n => ({ name: n, description: `${n} description` })),
      ...big,
    ];
    const out = filterCatalog(catalog, []);
    for (const name of core) {
      expect(out.entries.some(e => e.name === name)).toBe(true);
    }
  });

  it('scores matches on description and bonuses name matches', () => {
    const catalog = [
      { name: 'unrelated', description: 'blah blah' },
      { name: 'perfume-stylist', description: 'does stuff with fragrances' },
      { name: 'generic', description: 'handles perfume products sometimes' },
      // include core so the function runs normally
      { name: 'product-owner', description: '' },
      { name: 'backend-architect', description: '' },
      { name: 'frontend-developer', description: '' },
      { name: 'code-reviewer', description: '' },
      { name: 'security-auditor', description: '' },
      { name: 'test-automator', description: '' },
    ];
    const out = filterCatalog(catalog, ['perfume']);
    const idx = (name: string) => out.entries.findIndex(e => e.name === name);
    // perfume-stylist (name match +2 and description mention) should outrank generic
    expect(idx('perfume-stylist')).toBeGreaterThan(-1);
    expect(idx('generic')).toBeGreaterThan(-1);
  });

  it('caps the result at 40 entries', () => {
    const catalog = big.map(e => ({ name: e.name + '-frontend', description: e.description + ' frontend' }));
    const out = filterCatalog(catalog, ['frontend']);
    expect(out.entries.length).toBeLessThanOrEqual(40);
  });

  it('sets truncated=true when pre-filter matches exceed 40', () => {
    const catalog = big.map(e => ({ name: e.name + '-frontend', description: 'frontend ' + e.description }));
    const out = filterCatalog(catalog, ['frontend']);
    expect(out.truncated).toBe(true);
  });

  it('sets truncated=false when below the cap', () => {
    const catalog = [
      { name: 'frontend-developer', description: 'ui' },
      { name: 'backend-architect', description: 'apis' },
    ];
    const out = filterCatalog(catalog, ['frontend']);
    expect(out.truncated).toBe(false);
  });

  it('drops stop-word-only inputs and shows fallback set', () => {
    const catalog = [
      { name: 'product-owner', description: '' },
      { name: 'frontend-developer', description: '' },
      { name: 'backend-architect', description: '' },
      { name: 'code-reviewer', description: '' },
      { name: 'security-auditor', description: '' },
      { name: 'test-automator', description: '' },
      { name: 'unrelated', description: 'blah' },
    ];
    const out = filterCatalog(catalog, ['the', 'a', 'I']);
    expect(out.noKeywordMatches).toBe(true);
    expect(out.entries.every(e => e.name !== 'unrelated')).toBe(true);
  });
});
