export interface CatalogEntry {
  name: string;
  description: string;
}

export interface FilterResult {
  entries: CatalogEntry[];
  truncated: boolean;      // pre-filter matches exceeded the cap
  noKeywordMatches: boolean; // true when keywords produced zero hits across catalog
}

const CORE_ROLES: ReadonlySet<string> = new Set([
  'product-owner',
  'backend-architect',
  'frontend-developer',
  'code-reviewer',
  'security-auditor',
  'test-automator',
]);

const STOP_WORDS: ReadonlySet<string> = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'else',
  'for', 'to', 'with', 'of', 'on', 'in', 'at', 'by', 'as', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will',
  'i', 'we', 'you', 'they', 'he', 'she', 'it',
  'my', 'our', 'your', 'their',
  'this', 'that', 'these', 'those',
  'want', 'need', 'like', 'build', 'make', 'get', 'use', 'just',
]);

const MAX_ENTRIES = 40;

export function extractKeywords(raw: string[]): string[] {
  const joined = raw.join(' ').toLowerCase();
  const tokens = joined.split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set<string>();
  for (const t of tokens) {
    if (t.length < 3) continue;
    if (STOP_WORDS.has(t)) continue;
    out.add(t);
  }
  return [...out];
}

export function filterCatalog(
  catalog: ReadonlyArray<CatalogEntry>,
  keywords: ReadonlyArray<string>,
): FilterResult {
  // Filter stop words from keywords before scoring
  const effectiveKeywords = extractKeywords([...keywords]);

  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  let anyScore = 0;
  for (const entry of catalog) {
    const name = entry.name.toLowerCase();
    const desc = (entry.description ?? '').toLowerCase();
    let score = 0;
    for (const kw of effectiveKeywords) {
      const k = kw.toLowerCase();
      if (!k) continue;
      if (name.includes(k)) score += 3;        // name match: base 1 + bonus 2
      else if (desc.includes(k)) score += 1;
    }
    if (score > 0) anyScore += 1;
    scored.push({ entry, score });
  }

  const noKeywordMatches = anyScore === 0;

  // Sort by score desc, keep ties stable
  scored.sort((a, b) => b.score - a.score);

  const picked = new Map<string, CatalogEntry>();
  // Always include core roles (when present in the catalog)
  for (const e of catalog) {
    if (CORE_ROLES.has(e.name)) picked.set(e.name, e);
  }
  // Add top-scoring non-zero matches up to the cap
  for (const { entry, score } of scored) {
    if (picked.size >= MAX_ENTRIES) break;
    if (score <= 0) break;
    picked.set(entry.name, entry);
  }
  // If still under 40 and there were real keyword matches, backfill with remaining entries
  if (!noKeywordMatches) {
    for (const e of catalog) {
      if (picked.size >= MAX_ENTRIES) break;
      if (!picked.has(e.name)) picked.set(e.name, e);
    }
  }

  // Count pre-filter matches (entries with score > 0) to set truncated
  const preFilterMatches = scored.filter(s => s.score > 0).length;
  const truncated = preFilterMatches > MAX_ENTRIES;

  const entries = [...picked.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { entries, truncated, noKeywordMatches };
}
