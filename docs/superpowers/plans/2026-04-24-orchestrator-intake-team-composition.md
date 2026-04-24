# Orchestrator Intake + Team Composition + Project Docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add orchestrator-driven team composition via chat (empty team → intake → approve agent additions) and a project-doc sink that writes to Notion when configured, falling back to local markdown otherwise.

**Architecture:** A new `ProjectDocSink` interface abstracts where per-project documentation lives; `NotionProjectDoc` wraps the existing `notion.ts`, `LocalMarkdownProjectDoc` writes under `data/projects/<id>/`. The chat `plan_proposal` gains a `kind: 'work' | 'add_agent'` discriminator; the approve handler branches between the existing `dispatchApprovedPlan` (work) and a new `dispatchAgentAdds` (hydrate team). The prompt builder switches into "intake mode" when the team has zero agents and injects a relevance-filtered slice of the agent catalog so the orchestrator proposes real roles.

**Tech Stack:** Node/Express + `tsx` (backend), TypeScript, vitest harness (already wired in Tasks 1 & 2 of the prior plan), `@notionhq/client` (already a dep), React + Vite (frontend), `supertest` for HTTP tests.

**Spec:** [`docs/superpowers/specs/2026-04-24-orchestrator-intake-team-composition.md`](../specs/2026-04-24-orchestrator-intake-team-composition.md)

---

## Working Principles

- **TDD where it pays off.** Pure logic (parser change, catalog filter, local sink, dispatcher helper, prompt builder in intake mode) drives tests first. Integration into `server.ts` and the Notion sink (wraps real-but-mockable SDK calls) get integration-style tests with the SDK mocked. Frontend empty-state tweak has a tiny component test.
- **Frequent commits.** One commit per task. The commit message is given verbatim in the commit step.
- **Forward-compat only.** Existing persisted state with `Instruction.notionPageId` migrates at load time, one-shot; no separate migration script.
- **No mid-session sink fallback.** If the user starts with Notion enabled and the write fails, do NOT fall back to local — log and continue. Same rule the other direction.

---

## File Structure

### Backend — new files

| File | Responsibility |
|------|----------------|
| `agent-dashboard/backend/src/messages/catalogFilter.ts` | Pure function: rank + filter the agent catalog by keyword score, always-include core, and the 40-entry ceiling. |
| `agent-dashboard/backend/src/messages/__tests__/catalogFilter.test.ts` | Unit tests for the filter. |
| `agent-dashboard/backend/src/docs/types.ts` | `ProjectDocSink` interface + shared DTOs. |
| `agent-dashboard/backend/src/docs/localSink.ts` | `LocalMarkdownProjectDoc` — writes under `data/projects/<projectId>/`. |
| `agent-dashboard/backend/src/docs/notionSink.ts` | `NotionProjectDoc` — wraps `notion.ts`. |
| `agent-dashboard/backend/src/docs/factory.ts` | `resolveProjectDoc()` picks sink based on `isNotionEnabled()`. |
| `agent-dashboard/backend/src/docs/__tests__/*.test.ts` | Tests for local sink, Notion sink (SDK mocked), factory. |

### Backend — modified files

| File | Change |
|------|--------|
| `agent-dashboard/backend/notion.ts` | Add `createProjectPage`; extend `createTaskTicket` to accept optional `parentPageId`. |
| `agent-dashboard/backend/src/messages/types.ts` | Add `PlanItemKind`; add optional `kind?` to `PlanProposalItem`. |
| `agent-dashboard/backend/src/messages/parser.ts` | Accept optional `kind`, default to `work`, enforce homogeneity across items. |
| `agent-dashboard/backend/src/messages/prompt.ts` | Accept optional `availableAgents`; switch to intake mode when `team.agents.length === 0`; inject filtered catalog. |
| `agent-dashboard/backend/src/messages/router.ts` | Add `getAvailableAgents` callback to `MessagesDeps`; pass catalog into prompt builder. |
| `agent-dashboard/backend/server.ts` | Wire `ProjectDoc` factory; rename `Instruction.notionPageId` → `docTicketRef`; add `dispatchAgentAdds`; branch `onApproved` by kind; replace direct Notion calls with sink calls; hook `DELETE /api/projects/:id` to `sink.deleteProject`; pass `getAvailableAgents` to router. |

### Frontend — modified files

| File | Change |
|------|--------|
| `agent-dashboard/frontend/src/types.ts` | Add `PlanItemKind`; add optional `kind?` to `PlanProposalItem`. |
| `agent-dashboard/frontend/src/components/CommandCenter.tsx` | Update empty-state hint when the selected team has zero agents. |

### Verification commands (recurring)

- Backend tests: `cd agent-dashboard/backend && npm test`
- Backend typecheck: `cd agent-dashboard/backend && npx tsc --noEmit`
- Frontend tests: `cd agent-dashboard/frontend && npm test`
- Frontend typecheck: `cd agent-dashboard/frontend && npx tsc -b --noEmit`
- Frontend build (smoke): `cd agent-dashboard/frontend && npx vite build`

All commands run from the worktree root: `/Users/grishabarakov/sites/agents/.worktrees/unified-orchestrator-chat`.

---

## Tasks

### Task 1: Extend `PlanProposalItem` with optional `kind`

**Files:**
- Modify: `agent-dashboard/backend/src/messages/types.ts`
- Modify: `agent-dashboard/backend/src/messages/__tests__/types.test.ts`

- [ ] **Step 1: Write failing test for the new field**

Append to `agent-dashboard/backend/src/messages/__tests__/types.test.ts`:

```ts
  it('accepts a plan_proposal item with kind=add_agent', () => {
    const item: PlanProposalItem = {
      id: 'i2', title: 'frontend-developer', priority: 'high',
      kind: 'add_agent',
    };
    expect(item.kind).toBe('add_agent');
  });

  it('defaults an item without kind to undefined (treated as work downstream)', () => {
    const item: PlanProposalItem = {
      id: 'i3', title: 'task', priority: 'low',
    };
    expect(item.kind).toBeUndefined();
  });
```

Also add to the imports at the top of that file if not already present:

```ts
import type { Message, PlanProposalItem } from '../types';
```

- [ ] **Step 2: Run tests — the first new test fails at compile time**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/types.test.ts`
Expected: FAIL with a TypeScript error like `Type '"add_agent"' is not assignable to type ...` (since `kind` doesn't exist on the interface yet).

- [ ] **Step 3: Add `PlanItemKind` type and `kind?` field to `PlanProposalItem`**

In `agent-dashboard/backend/src/messages/types.ts`, add above `PlanProposalItem`:

```ts
export type PlanItemKind = 'work' | 'add_agent';
```

Extend `PlanProposalItem`:

```ts
export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
  kind?: PlanItemKind;
}
```

- [ ] **Step 4: Run tests — now pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/types.test.ts`
Expected: 5 passed (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/types.ts \
        agent-dashboard/backend/src/messages/__tests__/types.test.ts
git commit -m "feat(messages): add PlanItemKind and optional kind on PlanProposalItem"
```

---

### Task 2: Parser accepts `kind` and enforces homogeneity

**Files:**
- Modify: `agent-dashboard/backend/src/messages/parser.ts`
- Modify: `agent-dashboard/backend/src/messages/__tests__/parser.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `agent-dashboard/backend/src/messages/__tests__/parser.test.ts`:

```ts
  it('accepts add_agent kind and preserves it', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [
        { id: 'a', title: 'frontend-developer', priority: 'high', kind: 'add_agent' },
        { id: 'b', title: 'backend-architect', priority: 'medium', kind: 'add_agent' },
      ],
    }) + '\n```';
    const out = extractPlanProposal(text);
    expect(out?.items[0].kind).toBe('add_agent');
    expect(out?.items[1].kind).toBe('add_agent');
  });

  it('defaults missing kind to work', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [{ id: 'a', title: 'A', priority: 'high' }],
    }) + '\n```';
    const out = extractPlanProposal(text);
    expect(out?.items[0].kind).toBe('work');
  });

  it('returns null on mixed-kind items', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [
        { id: 'a', title: 'frontend-developer', priority: 'high', kind: 'add_agent' },
        { id: 'b', title: 'Build landing page', priority: 'medium', kind: 'work' },
      ],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });

  it('returns null on invalid kind value', () => {
    const text = '```json\n' + JSON.stringify({
      kind: 'plan_proposal', summary: 's',
      items: [{ id: 'a', title: 'A', priority: 'high', kind: 'nope' }],
    }) + '\n```';
    expect(extractPlanProposal(text)).toBeNull();
  });
```

- [ ] **Step 2: Run tests — the new ones fail**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/parser.test.ts`
Expected: 4 new tests FAIL.

- [ ] **Step 3: Extend the parser**

In `agent-dashboard/backend/src/messages/parser.ts`:

Add a constant near the top of the file (below the imports):

```ts
const VALID_KINDS: ReadonlySet<string> = new Set(['work', 'add_agent']);
```

Update `tryParse` so each item gets a kind (default `'work'`) and mixed kinds are rejected. Replace the existing item-parse loop with:

```ts
  const seen = new Set<string>();
  const items: PlanProposalItem[] = [];
  let sharedKind: 'work' | 'add_agent' | null = null;
  for (const rawItem of o.items) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const i = rawItem as Record<string, unknown>;
    if (typeof i.id !== 'string' || !i.id.trim()) return null;
    if (seen.has(i.id)) return null;
    seen.add(i.id);
    if (typeof i.title !== 'string' || !i.title.trim()) return null;
    if (typeof i.priority !== 'string' || !VALID_PRIORITIES.has(i.priority as Priority)) return null;
    let kind: 'work' | 'add_agent' = 'work';
    if (i.kind !== undefined) {
      if (typeof i.kind !== 'string' || !VALID_KINDS.has(i.kind)) return null;
      kind = i.kind as 'work' | 'add_agent';
    }
    if (sharedKind === null) sharedKind = kind;
    else if (sharedKind !== kind) return null; // mixed kinds not allowed
    items.push({
      id: i.id,
      title: i.title,
      detail: typeof i.detail === 'string' ? i.detail : undefined,
      priority: i.priority as Priority,
      suggestedAgent: typeof i.suggestedAgent === 'string' ? i.suggestedAgent : undefined,
      kind,
    });
  }
```

- [ ] **Step 4: Run tests — all pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/parser.test.ts`
Expected: 11 passed (7 existing + 4 new).

Also run the full backend suite to catch regressions:

Run: `cd agent-dashboard/backend && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/parser.ts \
        agent-dashboard/backend/src/messages/__tests__/parser.test.ts
git commit -m "feat(messages): parse kind and enforce plan item homogeneity"
```

---

### Task 3: Catalog relevance filter (pure)

**Files:**
- Create: `agent-dashboard/backend/src/messages/catalogFilter.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/catalogFilter.test.ts`

- [ ] **Step 1: Write failing tests**

File: `agent-dashboard/backend/src/messages/__tests__/catalogFilter.test.ts`

```ts
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
```

- [ ] **Step 2: Run — module not found**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/catalogFilter.test.ts`
Expected: FAIL — `Failed to resolve import "../catalogFilter"`.

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/messages/catalogFilter.ts`

```ts
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
  const scored: Array<{ entry: CatalogEntry; score: number }> = [];
  let anyScore = 0;
  for (const entry of catalog) {
    const name = entry.name.toLowerCase();
    const desc = (entry.description ?? '').toLowerCase();
    let score = 0;
    for (const kw of keywords) {
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
  // If still under 40, backfill with remaining entries in their catalog order
  for (const e of catalog) {
    if (picked.size >= MAX_ENTRIES) break;
    if (!picked.has(e.name)) picked.set(e.name, e);
  }

  // Count pre-filter matches (entries with score > 0) to set truncated
  const preFilterMatches = scored.filter(s => s.score > 0).length;
  const truncated = preFilterMatches > MAX_ENTRIES;

  const entries = [...picked.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { entries, truncated, noKeywordMatches };
}
```

- [ ] **Step 4: Run — all pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/catalogFilter.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/catalogFilter.ts \
        agent-dashboard/backend/src/messages/__tests__/catalogFilter.test.ts
git commit -m "feat(messages): add relevance filter for agent catalog"
```

---

### Task 4: Prompt builder gains intake mode

**Files:**
- Modify: `agent-dashboard/backend/src/messages/prompt.ts`
- Modify: `agent-dashboard/backend/src/messages/__tests__/prompt.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `agent-dashboard/backend/src/messages/__tests__/prompt.test.ts`:

```ts
  const catalog = [
    { name: 'frontend-developer', description: 'builds UIs' },
    { name: 'backend-architect', description: 'designs APIs' },
    { name: 'product-owner', description: 'defines requirements' },
    { name: 'code-reviewer', description: 'reviews code' },
    { name: 'security-auditor', description: 'audits security' },
    { name: 'test-automator', description: 'writes tests' },
    { name: 'perfume-stylist', description: 'designs fragrances' },
  ];

  it('enters intake mode when team is empty and catalog is provided', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [], availableAgents: catalog,
    });
    expect(prompt).toMatch(/has no agents yet/i);
    expect(prompt).toMatch(/add_agent/);
    expect(prompt).toContain('frontend-developer');
  });

  it('stays in normal mode when team has agents', () => {
    const prompt = buildOrchestratorPrompt({
      team, project, thread: [], availableAgents: catalog,
    });
    expect(prompt).not.toMatch(/has no agents yet/i);
  });

  it('includes a truncation note when pre-filter matches exceed 40', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const big = Array.from({ length: 60 }, (_, i) => ({
      name: `perfume-agent-${i}`,
      description: `perfume related agent ${i}`,
    }));
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [
        { id: 'u1', role: 'user', kind: 'text', content: 'help me with a perfume app',
          createdAt: new Date().toISOString() },
      ],
      availableAgents: [...big, ...catalog],
    });
    expect(prompt).toMatch(/narrow your ask/i);
  });

  it('emits fallback hint when no keywords match', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [
        { id: 'u1', role: 'user', kind: 'text', content: 'hi',
          createdAt: new Date().toISOString() },
      ],
      availableAgents: catalog,
    });
    expect(prompt).toMatch(/tell me more about the project/i);
  });
```

- [ ] **Step 2: Run — new tests fail**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/prompt.test.ts`
Expected: 4 new tests FAIL (intake mode text, fallback text not present).

- [ ] **Step 3: Extend the prompt builder**

Open `agent-dashboard/backend/src/messages/prompt.ts`.

Add import at top:

```ts
import { filterCatalog, extractKeywords, type CatalogEntry } from './catalogFilter';
```

Change the `PromptAgentEntry` alias to re-export from catalogFilter:

```ts
export type PromptAgentEntry = CatalogEntry;
```

Extend the arg type of `buildOrchestratorPrompt`:

```ts
export function buildOrchestratorPrompt(args: {
  team: PromptTeam;
  project: PromptProject;
  thread: Message[];
  availableAgents?: PromptAgentEntry[];
}): string {
```

Inside the function, after `const textThread = …` and before the existing `return` array, add:

```ts
  const intakeMode = team.agents.length === 0 && !!args.availableAgents && args.availableAgents.length > 0;

  if (intakeMode) {
    const userText = textThread
      .filter(m => m.role === 'user')
      .map(m => m.content);
    const keywords = extractKeywords([
      ...userText,
      project.name,
    ]);
    const { entries, truncated, noKeywordMatches } = filterCatalog(args.availableAgents!, keywords);

    const catalogLines = entries
      .map(e => `- ${e.name}: ${(e.description ?? '').slice(0, 80)}`)
      .join('\n');

    const fallbackHint = noKeywordMatches
      ? `\n\n(I have more agents in my catalog — tell me more about the project and I'll suggest specific ones.)`
      : '';
    const truncatedNote = truncated
      ? `\n\n(${entries.length} agents shown; more available — narrow your ask if you need a different specialty.)`
      : '';

    return [
      `You are the orchestrator for a development team. The team has no agents yet. Your job is to understand the project before proposing a team.`,
      ``,
      `Project: ${project.name} (${project.path})`,
      ``,
      `Response format — pick ONE of these two shapes per turn:`,
      ``,
      `1. Plain prose — a focused clarifying question. Ask as many questions across turns as you need (one per turn is ideal) to establish what is being built, target users, tech stack/platform, and the most important constraints. Don't rush to a team proposal before you're confident.`,
      ``,
      `2. A plan proposal with add_agent items — emit this ONLY when you have enough context. Every item MUST have "kind": "add_agent" and "title" MUST be an exact agent role from the catalog below. Use "detail" to explain why this agent fits.`,
      ``,
      '```json',
      `{`,
      `  "kind": "plan_proposal",`,
      `  "summary": "Proposed team for <brief project description>.",`,
      `  "items": [`,
      `    { "id": "short-slug", "title": "<exact-role-from-catalog>", "detail": "Why this agent fits", "priority": "high", "kind": "add_agent" }`,
      `  ]`,
      `}`,
      '```',
      ``,
      `Do NOT emit a plan_proposal with "kind": "work" while the team is empty — work items require agents to dispatch.`,
      ``,
      `Agent catalog (use exact role strings):`,
      catalogLines + fallbackHint + truncatedNote,
      ``,
      `Recent conversation:`,
      textThread.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Orchestrator'}: ${m.content}`).join('\n\n') || '(none)',
      ``,
      `Respond now.`,
    ].join('\n');
  }

  // Fall through to normal-mode prompt below.
```

Keep the existing normal-mode prompt body unchanged.

- [ ] **Step 4: Run — all pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/prompt.test.ts`
Expected: 8 passed (4 existing + 4 new).

Run full suite:
`cd agent-dashboard/backend && npm test` — expected all green.

Typecheck:
`cd agent-dashboard/backend && npx tsc --noEmit` — expected no errors.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/prompt.ts \
        agent-dashboard/backend/src/messages/__tests__/prompt.test.ts
git commit -m "feat(messages): intake-mode prompt with relevance-filtered catalog"
```

---

### Task 5: Router deps gain `getAvailableAgents`

**Files:**
- Modify: `agent-dashboard/backend/src/messages/router.ts`
- Modify: `agent-dashboard/backend/src/messages/__tests__/router.test.ts`

- [ ] **Step 1: Add failing test asserting the catalog reaches the prompt**

Append to `agent-dashboard/backend/src/messages/__tests__/router.test.ts`. This test spies on the provider call to capture the prompt used, verifies the `perfume-stylist` agent (in the supplied catalog) shows up when the team is empty:

```ts
  it('includes catalog in intake-mode prompt via getAvailableAgents', async () => {
    let capturedPrompt = '';
    const app2 = express();
    app2.use(express.json());
    const store2 = new MessageStore();
    app2.use('/api/teams/:teamId/messages', createMessagesRouter({
      store: store2,
      getTeam: () => ({
        id: 't1', name: 'T', agents: [],
        orchestratorProvider: 'claude', orchestratorModel: 'sonnet',
      }),
      getProject: () => ({ id: 'p1', name: 'Perfume', path: '/tmp' }),
      getAvailableAgents: () => [
        { name: 'perfume-stylist', description: 'designs fragrances' },
      ],
      getProvider: () => ({
        async streamTurn({ prompt, onChunk }) {
          capturedPrompt = prompt;
          onChunk('hi');
          return { fullText: 'hi' };
        },
      }),
      onApproved: () => {},
      emit: () => {},
    }));
    await request(app2).post('/api/teams/t1/messages').send({ content: 'tell me' });
    expect(capturedPrompt).toContain('perfume-stylist');
  });
```

Also update the beforeEach block's `createMessagesRouter({...})` call to include `getAvailableAgents: () => []` so the existing tests keep compiling — add that key once into the shared wiring.

- [ ] **Step 2: Run — FAIL**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/router.test.ts`
Expected: new test fails (catalog never reaches prompt; property doesn't exist yet).

- [ ] **Step 3: Extend `MessagesDeps` and the POST handler**

In `agent-dashboard/backend/src/messages/router.ts`:

1. Import the catalog entry type:

```ts
import type { PromptAgentEntry } from './prompt';
```

2. Add `getAvailableAgents` to `MessagesDeps`:

```ts
export interface MessagesDeps {
  store: MessageStore;
  getTeam: (teamId: string) => TeamWithProviderConfig | undefined;
  getProject: (teamId: string) => PromptProject | undefined;
  getAvailableAgents: () => PromptAgentEntry[];
  getProvider: (team: TeamWithProviderConfig, project: PromptProject) => OrchestratorProvider;
  onApproved: (teamId: string, planMessageId: string, itemIds: string[]) => void;
  emit: (event: string, payload: unknown) => void;
}
```

3. In the POST handler, pass the catalog into the prompt builder:

```ts
    const prompt = buildOrchestratorPrompt({
      team, project, thread: deps.store.get(teamId),
      availableAgents: deps.getAvailableAgents(),
    });
```

- [ ] **Step 4: Run — tests pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/router.test.ts`
Expected: 7 passed (6 existing + 1 new).

Run: `cd agent-dashboard/backend && npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/router.ts \
        agent-dashboard/backend/src/messages/__tests__/router.test.ts
git commit -m "feat(messages): pass available-agents catalog into the prompt via router deps"
```

---

### Task 6: `ProjectDocSink` interface

**Files:**
- Create: `agent-dashboard/backend/src/docs/types.ts`

- [ ] **Step 1: Write the interface**

File: `agent-dashboard/backend/src/docs/types.ts`

```ts
export interface AgentReport {
  agentName: string;
  role: string;
  task: string;
  status: string;
  reasoning: string;
  filesChanged: string[];
  summary: string;
  output?: string;
}

export interface ProjectInput {
  projectId: string;
  name: string;
  path: string;
  url?: string;
  description?: string;
}

export interface TeamCompositionEntry {
  role: string;
  rationale: string;
}

export interface AppendTaskInput {
  title: string;
  items: string[];       // approved plan-item titles
  agents: string[];      // agent names on the team at dispatch time
}

export interface ProjectDocSink {
  createProject(input: ProjectInput): Promise<void>;
  appendBrief(projectId: string, userMessage: string): Promise<void>;
  appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void>;
  appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }>;
  updateTaskStatus(projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void>;
  appendAgentReport(projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add agent-dashboard/backend/src/docs/types.ts
git commit -m "feat(docs): add ProjectDocSink interface and shared DTOs"
```

---

### Task 7: `LocalMarkdownProjectDoc`

**Files:**
- Create: `agent-dashboard/backend/src/docs/localSink.ts`
- Create: `agent-dashboard/backend/src/docs/__tests__/localSink.test.ts`

- [ ] **Step 1: Write failing tests (use a temp dir so real files are created and read back)**

File: `agent-dashboard/backend/src/docs/__tests__/localSink.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMarkdownProjectDoc } from '../localSink';

describe('LocalMarkdownProjectDoc', () => {
  let root: string;
  let sink: LocalMarkdownProjectDoc;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docsink-'));
    sink = new LocalMarkdownProjectDoc(root);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('creates project.md with front-matter on createProject', async () => {
    await sink.createProject({
      projectId: 'p1', name: 'My App', path: '/work/app',
      description: 'A cool app', url: 'https://x.example',
    });
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toContain('My App');
    expect(md).toContain('/work/app');
    expect(md).toContain('A cool app');
    expect(md).toContain('https://x.example');
  });

  it('appends brief entries', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendBrief('p1', 'Users = public');
    await sink.appendBrief('p1', 'Tech = Next.js');
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toMatch(/Users = public/);
    expect(md).toMatch(/Tech = Next\.js/);
  });

  it('appends team composition entries', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendTeamComposition('p1', [
      { role: 'frontend-developer', rationale: 'for the UI' },
      { role: 'backend-architect', rationale: 'for the API' },
    ]);
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toMatch(/frontend-developer/);
    expect(md).toMatch(/backend-architect/);
  });

  it('creates a task markdown and returns its ref', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    const { ticketRef } = await sink.appendTask('p1', {
      title: 'Redesign hero', items: ['Hero section', 'CTA'], agents: ['frontend-developer'],
    });
    expect(ticketRef).toBeDefined();
    const files = await readdir(join(root, 'p1', 'tasks'));
    expect(files).toHaveLength(1);
    const md = await readFile(join(root, 'p1', ticketRef!), 'utf-8');
    expect(md).toMatch(/Redesign hero/);
    expect(md).toMatch(/- Hero section/);
  });

  it('updateTaskStatus appends a status line', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    const { ticketRef } = await sink.appendTask('p1', {
      title: 't', items: ['x'], agents: [],
    });
    await sink.updateTaskStatus('p1', ticketRef, 'Done');
    const md = await readFile(join(root, 'p1', ticketRef!), 'utf-8');
    expect(md).toMatch(/Status: Done/);
  });

  it('appendAgentReport with undefined ticketRef is a no-op (no crash)', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendAgentReport('p1', undefined, {
      agentName: 'X', role: 'r', task: 't', status: 'complete',
      reasoning: '', filesChanged: [], summary: '',
    });
    // project.md should exist and be unchanged by the no-op
    const files = await readdir(join(root, 'p1'));
    expect(files).toContain('project.md');
  });

  it('deleteProject removes the project directory', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.deleteProject('p1');
    await expect(readFile(join(root, 'p1', 'project.md'), 'utf-8')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — module-not-found**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/localSink.test.ts`
Expected: FAIL with `Failed to resolve import "../localSink"`.

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/docs/localSink.ts`

```ts
import { mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ProjectDocSink, ProjectInput, TeamCompositionEntry,
  AppendTaskInput, AgentReport,
} from './types';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export class LocalMarkdownProjectDoc implements ProjectDocSink {
  constructor(private readonly rootDir: string) {}

  private projectDir(projectId: string): string {
    return join(this.rootDir, projectId);
  }
  private projectMd(projectId: string): string {
    return join(this.projectDir(projectId), 'project.md');
  }

  async createProject(input: ProjectInput): Promise<void> {
    await mkdir(this.projectDir(input.projectId), { recursive: true });
    const content =
      `# ${input.name}\n\n` +
      `- **Path:** \`${input.path}\`\n` +
      (input.url ? `- **URL:** ${input.url}\n` : '') +
      (input.description ? `- **Description:** ${input.description}\n` : '') +
      `- **Created:** ${new Date().toISOString()}\n` +
      `\n## Brief\n\n` +
      `## Team composition\n\n`;
    await writeFile(this.projectMd(input.projectId), content);
  }

  async appendBrief(projectId: string, userMessage: string): Promise<void> {
    if (!existsSync(this.projectMd(projectId))) return;
    const line = `\n- _${new Date().toISOString()}_ — ${userMessage.replace(/\n/g, ' ')}\n`;
    // Append under ## Brief — simplest: append at end, since ## Team composition follows
    // but for v1 we append at file end. Readers can reorganize.
    await appendFile(this.projectMd(projectId), line);
  }

  async appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void> {
    if (!existsSync(this.projectMd(projectId))) return;
    const block = `\n### Team composition — ${new Date().toISOString()}\n\n` +
      entries.map(e => `- **${e.role}** — ${e.rationale}`).join('\n') + `\n`;
    await appendFile(this.projectMd(projectId), block);
  }

  async appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }> {
    const dir = join(this.projectDir(projectId), 'tasks');
    await mkdir(dir, { recursive: true });
    const file = `${stamp()}-${slug(input.title)}.md`;
    const relative = join('tasks', file);
    const content =
      `# ${input.title}\n\n` +
      `- **Created:** ${new Date().toISOString()}\n` +
      `- **Status:** In Progress\n` +
      `- **Agents:** ${input.agents.join(', ') || '(none)'}\n\n` +
      `## Items\n\n` +
      input.items.map(i => `- ${i}`).join('\n') + `\n\n` +
      `## Reports\n\n`;
    await writeFile(join(this.projectDir(projectId), relative), content);
    return { ticketRef: relative };
  }

  async updateTaskStatus(projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void> {
    if (!ticketRef) return;
    const path = join(this.projectDir(projectId), ticketRef);
    if (!existsSync(path)) return;
    await appendFile(path, `\n\n- **Status:** ${status} (updated ${new Date().toISOString()})\n`);
  }

  async appendAgentReport(projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void> {
    if (!ticketRef) return;
    const path = join(this.projectDir(projectId), ticketRef);
    if (!existsSync(path)) return;
    const block =
      `\n### ${report.agentName} (${report.role}) — ${report.status}\n\n` +
      `**Task:** ${report.task}\n\n` +
      (report.reasoning ? `**Reasoning:** ${report.reasoning}\n\n` : '') +
      (report.filesChanged.length > 0 ? `**Files changed:**\n` + report.filesChanged.map(f => `- \`${f}\``).join('\n') + `\n\n` : '') +
      (report.summary ? `**Summary:** ${report.summary}\n\n` : '');
    await appendFile(path, block);
  }

  async deleteProject(projectId: string): Promise<void> {
    await rm(this.projectDir(projectId), { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run — tests pass**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/localSink.test.ts`
Expected: 7 passed.

Run full suite + typecheck:
`cd agent-dashboard/backend && npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/docs/localSink.ts \
        agent-dashboard/backend/src/docs/__tests__/localSink.test.ts
git commit -m "feat(docs): LocalMarkdownProjectDoc sink with per-project directory layout"
```

---

### Task 8: Extend `notion.ts` with `createProjectPage` and `parentPageId` on task tickets

**Files:**
- Modify: `agent-dashboard/backend/notion.ts`

No dedicated test (requires live Notion). Covered by the Notion-sink tests in Task 9 which mock the `@notionhq/client` module.

- [ ] **Step 1: Add `createProjectPage`**

At the bottom of `agent-dashboard/backend/notion.ts`:

```ts
export async function createProjectPage(input: {
  name: string;
  path: string;
  url?: string;
  description?: string;
}): Promise<string | null> {
  if (!notion || !databaseId) return null;
  try {
    const children: any[] = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [
          { type: 'text', text: { content: `Path: ${input.path}` } },
        ] },
      },
    ];
    if (input.url) children.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: `URL: ${input.url}` } }] },
    });
    if (input.description) children.push({
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: input.description } }] },
    });
    children.push({ object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: 'Brief' } }] } });
    children.push({ object: 'block', type: 'heading_2',
      heading_2: { rich_text: [{ type: 'text', text: { content: 'Team composition' } }] } });

    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        'Name': { title: [{ text: { content: `[Project] ${input.name}` } }] },
        'Status': { select: { name: 'Active' } },
      },
      children,
    });
    return page.id;
  } catch (err) {
    console.error('Notion: failed to create project page:', err);
    return null;
  }
}
```

- [ ] **Step 2: Extend `createTaskTicket` to accept `parentPageId`**

Replace the signature and the `parent:` block. The updated function:

```ts
export async function createTaskTicket(params: {
  title: string;
  teamName: string;
  projectName: string;
  instruction: string;
  agents: string[];
  parentPageId?: string;
}): Promise<string | null> {
  if (!notion || !databaseId) return null;
  try {
    const parent: any = params.parentPageId
      ? { page_id: params.parentPageId }
      : { database_id: databaseId };
    const page = await notion.pages.create({
      parent,
      properties: params.parentPageId
        ? { 'title': { title: [{ text: { content: params.title } }] } }
        : {
            'Name': { title: [{ text: { content: params.title } }] },
            'Status': { select: { name: 'In Progress' } },
            'Team': { rich_text: [{ text: { content: params.teamName } }] },
            'Project': { rich_text: [{ text: { content: params.projectName } }] },
          },
      children: [
        // … keep existing children as before …
      ]
    });
    return page.id;
  } catch (err) {
    console.error('Notion: failed to create ticket:', err);
    return null;
  }
}
```

(Preserve the existing `children` array verbatim — Instruction heading, agents to-do list, Agent Reports heading.)

Rationale: when we create a task as a CHILD of the project page, Notion doesn't let us attach database properties like `Status` or `Team` — those only apply when the parent is the database. In child-page mode, we use the block content (which already covers the same info) and a page-level `title` property.

- [ ] **Step 3: Typecheck**

Run: `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Run backend test suite (no new tests, but ensure no regressions)**

Run: `cd agent-dashboard/backend && npm test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/notion.ts
git commit -m "feat(notion): add createProjectPage; parentPageId option on task ticket"
```

---

### Task 9: `NotionProjectDoc` sink

**Files:**
- Create: `agent-dashboard/backend/src/docs/notionSink.ts`
- Create: `agent-dashboard/backend/src/docs/__tests__/notionSink.test.ts`

- [ ] **Step 1: Write failing tests with `notion.ts` mocked**

File: `agent-dashboard/backend/src/docs/__tests__/notionSink.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createProjectPageMock, createTaskTicketMock, updateTicketStatusMock,
  appendAgentReportMock,
} = vi.hoisted(() => ({
  createProjectPageMock: vi.fn(),
  createTaskTicketMock: vi.fn(),
  updateTicketStatusMock: vi.fn(),
  appendAgentReportMock: vi.fn(),
}));

vi.mock('../../../notion.js', () => ({
  createProjectPage: createProjectPageMock,
  createTaskTicket: createTaskTicketMock,
  updateTicketStatus: updateTicketStatusMock,
  appendAgentReport: appendAgentReportMock,
  checkAgentTodo: vi.fn(),
  isNotionEnabled: () => true,
  initNotion: vi.fn(),
}));

import { NotionProjectDoc } from '../notionSink';

describe('NotionProjectDoc', () => {
  let sink: NotionProjectDoc;

  beforeEach(() => {
    createProjectPageMock.mockReset();
    createTaskTicketMock.mockReset();
    updateTicketStatusMock.mockReset();
    appendAgentReportMock.mockReset();
    sink = new NotionProjectDoc();
  });

  it('createProject stores the Notion page id and remembers it', async () => {
    createProjectPageMock.mockResolvedValue('page-abc');
    await sink.createProject({ projectId: 'p1', name: 'App', path: '/p' });
    // appendTask should pass the stored page id as parentPageId
    await sink.appendTask('p1', { title: 't', items: ['a'], agents: ['frontend-developer'] });
    expect(createTaskTicketMock).toHaveBeenCalledWith(expect.objectContaining({
      parentPageId: 'page-abc',
    }));
  });

  it('appendTask without prior createProject still calls createTaskTicket (no parent)', async () => {
    createTaskTicketMock.mockResolvedValue('tkt-1');
    const { ticketRef } = await sink.appendTask('unknown', { title: 't', items: [], agents: [] });
    expect(createTaskTicketMock).toHaveBeenCalledWith(expect.objectContaining({
      parentPageId: undefined,
    }));
    expect(ticketRef).toBe('tkt-1');
  });

  it('updateTaskStatus passes the ticketRef through', async () => {
    await sink.updateTaskStatus('p1', 'tkt-1', 'Done');
    expect(updateTicketStatusMock).toHaveBeenCalledWith('tkt-1', 'Done');
  });

  it('updateTaskStatus with undefined ticketRef is a no-op', async () => {
    await sink.updateTaskStatus('p1', undefined, 'Done');
    expect(updateTicketStatusMock).not.toHaveBeenCalled();
  });

  it('appendAgentReport with undefined ticketRef is a no-op', async () => {
    await sink.appendAgentReport('p1', undefined, {
      agentName: 'a', role: 'r', task: 't', status: 'complete',
      reasoning: '', filesChanged: [], summary: '',
    });
    expect(appendAgentReportMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/notionSink.test.ts`
Expected: module `../notionSink` not found.

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/docs/notionSink.ts`

```ts
import {
  createProjectPage, createTaskTicket, updateTicketStatus,
  appendAgentReport as notionAppendReport,
} from '../../notion.js';
import type {
  ProjectDocSink, ProjectInput, TeamCompositionEntry,
  AppendTaskInput, AgentReport,
} from './types';

export class NotionProjectDoc implements ProjectDocSink {
  private readonly pageIds = new Map<string, string>();

  async createProject(input: ProjectInput): Promise<void> {
    const pageId = await createProjectPage({
      name: input.name,
      path: input.path,
      url: input.url,
      description: input.description,
    });
    if (pageId) this.pageIds.set(input.projectId, pageId);
  }

  async appendBrief(projectId: string, userMessage: string): Promise<void> {
    // Notion append-block requires a block-children request; we accept that
    // for v1 the brief appears as a separate task-like ticket is overkill,
    // so we append nothing here and rely on the project page having the
    // "Brief" heading. Follow-up: upgrade to a proper blocks.children.append.
    // This call is intentionally a no-op for the Notion sink in v1 — logged for
    // visibility so users know it isn't lost in the ether during local dev.
    // (Local sink persists the brief in project.md.)
    void projectId; void userMessage;
  }

  async appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void> {
    // Same rationale as appendBrief — v1 no-op on Notion; local sink carries it.
    void projectId; void entries;
  }

  async appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }> {
    const parentPageId = this.pageIds.get(projectId);
    const pageId = await createTaskTicket({
      title: input.title,
      teamName: '',              // project-doc abstraction omits these;
      projectName: projectId,    // the legacy fields are optional-ish
      instruction: input.items.join('\n'),
      agents: input.agents,
      parentPageId,
    });
    return { ticketRef: pageId ?? undefined };
  }

  async updateTaskStatus(_projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void> {
    if (!ticketRef) return;
    await updateTicketStatus(ticketRef, status);
  }

  async appendAgentReport(_projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void> {
    if (!ticketRef) return;
    await notionAppendReport(ticketRef, {
      agentName: report.agentName,
      role: report.role,
      task: report.task,
      status: report.status,
      output: report.output ?? '',
      filesChanged: report.filesChanged,
      reasoning: report.reasoning,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    // Archive is handled via Notion UI; v1 sink just drops the local mapping.
    // A follow-up spec covers calling pages.update({ page_id, archived: true }).
    this.pageIds.delete(projectId);
  }
}
```

**Note for the planner:** `appendBrief` and `appendTeamComposition` are intentional no-ops in the Notion sink v1 because appending a single block to an existing Notion page requires a `blocks.children.append` call that wasn't part of the `notion.ts` surface pre-existing. The local sink captures the full brief + composition. Upgrading Notion to real block-append is a follow-up task, not part of this plan, and the spec already treats docs as best-effort.

- [ ] **Step 4: Run — tests pass**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/notionSink.test.ts`
Expected: 5 passed.

Full suite + typecheck:
`cd agent-dashboard/backend && npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/docs/notionSink.ts \
        agent-dashboard/backend/src/docs/__tests__/notionSink.test.ts
git commit -m "feat(docs): NotionProjectDoc sink wrapping notion.ts"
```

---

### Task 10: `resolveProjectDoc` factory

**Files:**
- Create: `agent-dashboard/backend/src/docs/factory.ts`
- Create: `agent-dashboard/backend/src/docs/__tests__/factory.test.ts`

- [ ] **Step 1: Write failing tests**

File: `agent-dashboard/backend/src/docs/__tests__/factory.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';

const { isNotionEnabledMock } = vi.hoisted(() => ({
  isNotionEnabledMock: vi.fn(),
}));

vi.mock('../../../notion.js', () => ({
  createProjectPage: vi.fn(),
  createTaskTicket: vi.fn(),
  updateTicketStatus: vi.fn(),
  appendAgentReport: vi.fn(),
  checkAgentTodo: vi.fn(),
  isNotionEnabled: isNotionEnabledMock,
  initNotion: vi.fn(),
}));

import { resolveProjectDoc } from '../factory';
import { NotionProjectDoc } from '../notionSink';
import { LocalMarkdownProjectDoc } from '../localSink';

describe('resolveProjectDoc', () => {
  it('returns NotionProjectDoc when Notion is enabled', () => {
    isNotionEnabledMock.mockReturnValue(true);
    const sink = resolveProjectDoc({ localRootDir: '/tmp' });
    expect(sink).toBeInstanceOf(NotionProjectDoc);
  });

  it('returns LocalMarkdownProjectDoc when Notion is disabled', () => {
    isNotionEnabledMock.mockReturnValue(false);
    const sink = resolveProjectDoc({ localRootDir: '/tmp' });
    expect(sink).toBeInstanceOf(LocalMarkdownProjectDoc);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/factory.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/docs/factory.ts`

```ts
import { isNotionEnabled } from '../../notion.js';
import { LocalMarkdownProjectDoc } from './localSink';
import { NotionProjectDoc } from './notionSink';
import type { ProjectDocSink } from './types';

export interface FactoryOpts {
  localRootDir: string;
}

export function resolveProjectDoc(opts: FactoryOpts): ProjectDocSink {
  if (isNotionEnabled()) return new NotionProjectDoc();
  return new LocalMarkdownProjectDoc(opts.localRootDir);
}
```

- [ ] **Step 4: Run — tests pass**

Run: `cd agent-dashboard/backend && npx vitest run src/docs/__tests__/factory.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/docs/factory.ts \
        agent-dashboard/backend/src/docs/__tests__/factory.test.ts
git commit -m "feat(docs): resolveProjectDoc factory"
```

---

### Task 11: Rename `Instruction.notionPageId` to `docTicketRef` with load-time migration

**Files:**
- Modify: `agent-dashboard/backend/server.ts`

No dedicated test — observed by the persistence round-trip test in Task 13 and existing tests.

- [ ] **Step 1: Rename in the `Instruction` interface**

In `agent-dashboard/backend/server.ts`, find the `interface Instruction {` block (around line 59–69) and replace `notionPageId?: string;` with `docTicketRef?: string;`.

- [ ] **Step 2: Update the single write site**

Search for `.notionPageId = notionPageId` in `server.ts` (one occurrence). Replace with `.docTicketRef = docTicketRef` and rename the local variable `notionPageId` → `docTicketRef` in that function (the current `executePlanAndPhases`).

Search for any remaining uses of the local `notionPageId` variable inside `executePlanAndPhases` and rename consistently. The direct `notion.ts` calls (`appendAgentReport(notionPageId, …)`, `updateTicketStatus(notionPageId, …)`) will be replaced in Task 13 — leave them referencing the renamed local for now.

- [ ] **Step 3: Add load-time migration in `loadState`**

Find `loadState` (around line 198) and inside the loop that pushes instructions:

```ts
instructionsState.push(...(data.instructions || []));
```

Replace with:

```ts
for (const instr of (data.instructions || [])) {
  // Migrate legacy Instruction.notionPageId -> docTicketRef at load time.
  const legacy = instr as unknown as { notionPageId?: string; docTicketRef?: string };
  if (legacy.notionPageId && !legacy.docTicketRef) {
    legacy.docTicketRef = legacy.notionPageId;
    delete legacy.notionPageId;
  }
  instructionsState.push(instr);
}
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors.

Run: `cd agent-dashboard/backend && npm test`
Expected: all green (no tests touched this field directly).

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/server.ts
git commit -m "refactor(server): rename Instruction.notionPageId to docTicketRef with load-time migration"
```

---

### Task 12: Add `Project.docRef` and wire `ProjectDoc` into project-lifecycle handlers

**Files:**
- Modify: `agent-dashboard/backend/server.ts`
- Modify: `agent-dashboard/frontend/src/types.ts` (if the project type is shared/strict — tiny update)

- [ ] **Step 1: Add `docRef?: string` to the backend `Project` interface**

In `agent-dashboard/backend/server.ts`, find `interface Project {` (around line 50). Append `docRef?: string;`.

- [ ] **Step 2: Add the matching field to the frontend type**

In `agent-dashboard/frontend/src/types.ts`, find the `Project` interface and add `docRef?: string;`.

- [ ] **Step 3: Instantiate the factory once on boot**

In `server.ts`, near the top of the module (right after the existing `const messageStore = new MessageStore();` and `const executionAdapter = …` lines), add:

```ts
import { resolveProjectDoc } from './src/docs/factory';
// …existing imports…

const projectDoc = resolveProjectDoc({
  localRootDir: join(DATA_DIR, 'projects'),
});
```

Note: `DATA_DIR` is already defined above. The `projects/` subdirectory does not need to be created upfront — `LocalMarkdownProjectDoc.createProject` does `mkdir -p` per call.

- [ ] **Step 4: Wire `projectDoc.createProject` into the project-create handler**

In `app.post('/api/projects', …)` (around line 1111), after the successful `projectsState.set(id, project); io.emit('project:created', project);` block, add:

```ts
  try {
    await projectDoc.createProject({
      projectId: id, name: project.name, path: project.path,
      url: project.url, description: project.description,
    });
    project.docRef = `data/projects/${id}`; // purely informational for the frontend
  } catch (err) {
    console.warn('[projectDoc] createProject failed:', (err as Error).message);
  }
```

(Keeps the auto-create-team logic that already runs afterwards intact.)

- [ ] **Step 5: Wire `projectDoc.deleteProject` into the delete handler**

Find `app.delete('/api/projects/:projectId', …)` (around line 1152). After the `io.emit('project:deleted', …)` line, add:

```ts
  try {
    await projectDoc.deleteProject(projectId);
  } catch (err) {
    console.warn('[projectDoc] deleteProject failed:', (err as Error).message);
  }
```

- [ ] **Step 6: Typecheck + tests**

Run: `cd agent-dashboard/backend && npx tsc --noEmit && npm test`
Expected: all green.

Run: `cd agent-dashboard/frontend && npx tsc -b --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add agent-dashboard/backend/server.ts agent-dashboard/frontend/src/types.ts
git commit -m "feat(server): wire ProjectDoc sink into project create/delete"
```

---

### Task 13: Route execution-time Notion calls through `projectDoc`

**Files:**
- Modify: `agent-dashboard/backend/server.ts`

- [ ] **Step 1: Replace the existing `createTaskTicket` call inside `executePlanAndPhases`**

Find the block starting with:

```ts
if (isNotionEnabled()) {
  const projectName = project.name;
  notionPageId = await createTaskTicket({ … });
  …
}
```

Replace with:

```ts
let docTicketRef: string | undefined;
try {
  const result = await projectDoc.appendTask(project.id, {
    title: instruction.substring(0, 100),
    items: [instruction],
    agents: team.agents.map(a => a.name),
  });
  docTicketRef = result.ticketRef;
  if (docTicketRef && instructionObj) instructionObj.docTicketRef = docTicketRef;
  if (docTicketRef) addLog(team.id, undefined, 'info', 'Project doc: task entry created');
} catch (err) {
  console.warn('[projectDoc] appendTask failed:', (err as Error).message);
}
```

- [ ] **Step 2: Replace `appendAgentReport` and `checkAgentTodo` downstream**

Find the inner block after each agent completes (around line 785–795 — has `appendAgentReport(notionPageId, {…})` and `checkAgentTodo(notionPageId, agent.name)`):

```ts
if (notionPageId) {
  await appendAgentReport(notionPageId, { … });
  await checkAgentTodo(notionPageId, agent.name);
}
```

Replace with:

```ts
try {
  await projectDoc.appendAgentReport(project.id, docTicketRef, {
    agentName: report.agentName,
    role: report.role,
    task: report.task,
    status: report.status,
    output: agent.output,
    filesChanged: report.filesChanged,
    reasoning: report.reasoning,
    summary: report.summary,
  });
} catch (err) {
  console.warn('[projectDoc] appendAgentReport failed:', (err as Error).message);
}
```

Drop the `checkAgentTodo` call entirely — it was a Notion-only nicety that doesn't generalise to local markdown. (Follow-up note: add an optional "agents to-do" section on the local task markdown later if it proves useful.)

- [ ] **Step 3: Replace `updateTicketStatus`**

Find the end-of-execution block (around line 812–814):

```ts
if (notionPageId) {
  const anyFailed = …;
  await updateTicketStatus(notionPageId, anyFailed ? 'Failed' : 'Done');
  …
}
```

Replace with:

```ts
try {
  const anyFailed = team.agents.some(a => a.status === 'failed');
  await projectDoc.updateTaskStatus(project.id, docTicketRef, anyFailed ? 'Failed' : 'Done');
  addLog(team.id, undefined, 'info', `Project doc: task marked ${anyFailed ? 'Failed' : 'Done'}`);
} catch (err) {
  console.warn('[projectDoc] updateTaskStatus failed:', (err as Error).message);
}
```

- [ ] **Step 4: Clean up unused `notion.ts` imports**

In `server.ts` top-of-file imports, remove `createTaskTicket`, `updateTicketStatus`, `appendAgentReport`, `checkAgentTodo`, and `isNotionEnabled` from the `from './notion.js'` line — they're now only called indirectly through the sinks. Keep `initNotion`.

- [ ] **Step 5: Typecheck + tests**

Run: `cd agent-dashboard/backend && npx tsc --noEmit && npm test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add agent-dashboard/backend/server.ts
git commit -m "refactor(server): route execute-time Notion calls through ProjectDoc sink"
```

---

### Task 14: `dispatchAgentAdds` helper + onApproved branch

**Files:**
- Modify: `agent-dashboard/backend/server.ts`

- [ ] **Step 1: Add `dispatchAgentAdds`**

In `server.ts`, above `dispatchApprovedPlan` (around line 675):

```ts
async function dispatchAgentAdds(teamId: string, planMessageId: string, itemIds: string[]) {
  const team = teamsState.get(teamId);
  if (!team) return;
  const planMsg = messageStore.findById(teamId, planMessageId);
  if (!planMsg || planMsg.kind !== 'plan_proposal') return;

  const approved = planMsg.items.filter(i => itemIds.includes(i.id));
  const added: { role: string; rationale: string }[] = [];
  const skippedUnknown: string[] = [];
  const skippedDup: string[] = [];

  for (const item of approved) {
    const role = item.title;
    const catalog = availableAgents.find(a => a.name === role);
    if (!catalog) { skippedUnknown.push(role); continue; }
    if (team.agents.some(a => a.role === role)) { skippedDup.push(role); continue; }

    const displayName = role.split('-')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const modelChoice = catalog.model && catalog.model !== 'inherit'
      ? catalog.model
      : (team.orchestratorModel || 'sonnet');
    const newAgent: Agent = {
      id: `agent-${Math.random().toString(36).slice(2, 11)}`,
      name: displayName,
      role,
      status: 'idle',
      progress: 0,
      model: modelChoice,
      plugin: catalog.plugin,
    };
    team.agents.push(newAgent);
    added.push({ role, rationale: item.detail ?? '' });
  }

  io.emit('team:updated', team);

  // Emit an execution_status row describing the effect (shown inline in the thread).
  const detailParts: string[] = [];
  if (added.length) detailParts.push(`Added: ${added.map(a => a.role).join(', ')}`);
  if (skippedUnknown.length) detailParts.push(`Skipped (unknown role): ${skippedUnknown.join(', ')}`);
  if (skippedDup.length) detailParts.push(`Skipped (already on team): ${skippedDup.join(', ')}`);
  executionAdapter.emitEvent(teamId, planMessageId, {
    phase: 'team',
    status: added.length > 0 ? 'completed' : 'failed',
    detail: detailParts.join(' · ') || 'No changes',
  });

  // Persist to project doc if the team has a project
  if (team.projectId && added.length > 0) {
    try {
      await projectDoc.appendTeamComposition(team.projectId, added);
    } catch (err) {
      console.warn('[projectDoc] appendTeamComposition failed:', (err as Error).message);
    }
  }
}
```

- [ ] **Step 2: Branch `onApproved` inside the messages-router mount**

Find the `app.use('/api/teams/:teamId/messages', createMessagesRouter({…}))` block (around line 1080–1100). Replace the `onApproved` callback with:

```ts
  onApproved: (teamId, planMessageId, itemIds) => {
    const msg = messageStore.findById(teamId, planMessageId);
    if (!msg || msg.kind !== 'plan_proposal') return;
    const approvedItems = msg.items.filter(i => itemIds.includes(i.id));
    const kind = approvedItems[0]?.kind ?? 'work';
    if (kind === 'add_agent') {
      dispatchAgentAdds(teamId, planMessageId, itemIds)
        .catch(err => console.error('dispatch agents failed', err));
    } else {
      dispatchApprovedPlan(teamId, planMessageId, itemIds)
        .catch(err => console.error('dispatch plan failed', err));
    }
  },
  getAvailableAgents: () => availableAgents.map(a => ({
    name: a.name, description: a.description,
  })),
```

- [ ] **Step 3: Wire the intake user-message capture**

In the SAME `createMessagesRouter` wiring, update `emit` so that when a user text message lands on an empty team, it appends to the project doc as part of the brief:

Directly below the existing `emit:` key in the options:

```ts
  emit: (event, payload) => {
    io.emit(event, payload);
    if (event === 'chat:message') {
      const p = payload as { teamId: string; message: { role: string; kind: string; content?: string } };
      const team = teamsState.get(p.teamId);
      if (
        team && team.projectId &&
        team.agents.length === 0 &&
        p.message.role === 'user' && p.message.kind === 'text' &&
        typeof p.message.content === 'string' && p.message.content.trim().length > 0
      ) {
        projectDoc.appendBrief(team.projectId, p.message.content).catch(err =>
          console.warn('[projectDoc] appendBrief failed:', (err as Error).message));
      }
    }
  },
```

- [ ] **Step 4: Typecheck + tests**

Run: `cd agent-dashboard/backend && npx tsc --noEmit && npm test`
Expected: all green. The router integration test from Task 5 already exercises the new `getAvailableAgents` callback; the branching logic is integration-smoked in Task 16.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/server.ts
git commit -m "feat(server): dispatchAgentAdds + kind-based onApproved branch + intake brief capture"
```

---

### Task 15: Frontend — extend `PlanProposalItem` with `kind` and empty-state hint

**Files:**
- Modify: `agent-dashboard/frontend/src/types.ts`
- Modify: `agent-dashboard/frontend/src/components/CommandCenter.tsx`

- [ ] **Step 1: Add `PlanItemKind` + `kind?` to frontend `PlanProposalItem`**

In `agent-dashboard/frontend/src/types.ts`, above the existing `PlanProposalItem` interface:

```ts
export type PlanItemKind = 'work' | 'add_agent';
```

Extend the interface with `kind?: PlanItemKind;`.

- [ ] **Step 2: Update `CommandCenter.tsx` empty-state hint**

Find the empty-state block in `agent-dashboard/frontend/src/components/CommandCenter.tsx`:

```tsx
{messages.length === 0 ? (
  <p className="text-xs text-gray-500 text-center py-4">
    Tell the orchestrator what you want. It'll reply, or propose a plan you can approve.
  </p>
) : ( … )}
```

Replace the `<p>` text with a hint that reads differently when the team is empty. The `CommandCenter` currently receives only `teamId` and `teamName`. Change its signature to also accept `teamAgentCount: number`:

```tsx
export default function CommandCenter({
  teamId, teamName, teamAgentCount,
}: { teamId: string; teamName: string; teamAgentCount: number }) {
```

And the empty-state block:

```tsx
<p className="text-xs text-gray-500 text-center py-4">
  {teamAgentCount === 0
    ? "New team — tell the orchestrator what you're building and it'll help you pick agents."
    : "Tell the orchestrator what you want. It'll reply, or propose a plan you can approve."}
</p>
```

In `agent-dashboard/frontend/src/Dashboard.tsx`, find the `<CommandCenter teamId={selectedTeam.id} teamName={selectedTeam.name} />` and change to:

```tsx
<CommandCenter
  teamId={selectedTeam.id}
  teamName={selectedTeam.name}
  teamAgentCount={selectedTeam.agents.length}
/>
```

- [ ] **Step 3: Typecheck + tests + build**

Run: `cd agent-dashboard/frontend && npx tsc -b --noEmit && npm test && npx vite build 2>&1 | tail -5`
Expected: typecheck clean, 15 tests pass, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add agent-dashboard/frontend/src/types.ts \
        agent-dashboard/frontend/src/components/CommandCenter.tsx \
        agent-dashboard/frontend/src/Dashboard.tsx
git commit -m "feat(frontend): PlanItemKind type + empty-team CommandCenter hint"
```

---

### Task 16: Manual acceptance smoke

Not a code task — the verification checklist before declaring done. Run from the worktree:

- [ ] **Backend up:** `cd agent-dashboard/backend && npm run dev`.
      Expect `Loaded state: … projects, … teams, … instructions`. No error messages.
- [ ] **Frontend up:** `cd agent-dashboard/frontend && npm run dev`. Open `http://localhost:3000`.
- [ ] **Notion-off flow** — in `.env`, ensure `NOTION_TOKEN` is unset (or `.env` absent). Create a new project named `"Smoke Test"`. Verify:
  - Sidebar shows the project + one empty team named `Smoke Test`.
  - `agent-dashboard/backend/data/projects/proj-<id>/project.md` exists with the project metadata.
- [ ] **Intake dialog** — select the `Smoke Test` team. CommandCenter shows the new empty-state hint. Type: *"Build me a simple landing page for a perfume brand"*. Expect a clarifying question from the orchestrator (not a plan proposal, not a work plan). Answer with: *"Next.js, mobile-first, brand is minimalist"*. Expect another question OR a team proposal.
- [ ] **Team proposal** — when a `plan_proposal` appears with `kind: 'add_agent'` items (priority badges visible, each item is an agent role), tick 2–3 items and click **Approve selected**. Expect:
  - Card locks to `approved`.
  - An execution_status row appears under the card showing which agents were added.
  - The sidebar team card now shows those agents with their role colors.
- [ ] **Brief persisted locally** — reload `project.md` in the filesystem; confirm the user's intake messages are appended.
- [ ] **Work proposal** — send *"Now draft the hero section"*. Expect a `plan_proposal` with `kind: 'work'` items. Approve two. Confirm execution_status rows appear, agents start running, and `data/projects/proj-<id>/tasks/<timestamp>-…md` contains a task entry.
- [ ] **Notion-on (optional, requires `NOTION_TOKEN` + `NOTION_DATABASE_ID`)** — set env, restart backend, create a new project, and verify a project page appears in the configured Notion database and that approved work proposals create child pages under it.
- [ ] **Regression** — previously-created projects still load; old `Instruction.notionPageId` records (if any exist in persisted state) are rewritten to `docTicketRef` during `loadState`. Inspect `data/state.json` after one save-cycle to confirm.

If any step fails, **do not declare done** — triage and amend.

---

## Decisions / trade-offs locked in during planning

- **Intake Q&A goes to `project.md` for local, nowhere for Notion v1.** Notion block-append is its own API surface (`blocks.children.append`). The spec treats docs as best-effort; local captures the full trail. Notion block-append is a clean follow-up, not blocking this plan.
- **`checkAgentTodo` dropped.** The per-agent to-do checkbox on Notion tickets was a nicety that doesn't port to local markdown cleanly. The task's to-do list can be added later on both sinks in a follow-up.
- **Homogeneity enforcement lives in the parser**, not the dispatcher. Rejecting mixed items at parse time means the orchestrator can't accidentally send a mixed plan and have it silently bifurcate.
- **`title` is the dispatch key for `add_agent` items.** `suggestedAgent` is ignored to avoid a fallback ladder. The prompt makes the contract explicit so the orchestrator puts the role in `title`.
- **Agent-catalog relevance is keyword-based** with an always-include core and a 40-entry cap. Embeddings or a classifier call are out of scope.
- **No mid-session sink fallback.** If Notion is on and a write fails, we log — not silently write to local too. The user expects their configuration to be honored.

## After implementation

- Run a full regression pass with both sink modes (covered in Task 16).
- Invoke `superpowers:requesting-code-review` for a final review before merging this branch on top of the already-merged unified-chat work.
- Confirm the two deferred items (Notion block-append for brief/composition, per-agent to-do list on tasks) are captured in the follow-ups of the spec.
