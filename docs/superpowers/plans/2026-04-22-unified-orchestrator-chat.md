# Unified Orchestrator Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three-mode CommandCenter into a single conversational thread with structured plan-proposal messages, per-item approval, and a pluggable orchestrator provider (Claude or OpenAI) selected per team.

**Architecture:** One backend endpoint family (`/api/teams/:id/messages` + `/approve`) replaces `/chat` and `/instructions`. The orchestrator emits either plain text or a fenced JSON `plan_proposal`; approved items reuse the existing `executePlanAndPhases` pipeline. A small `OrchestratorProvider` interface lets a team be driven by `claude` (CLI) or `openai` (SDK). Frontend collapses to one input + one thread with structured message rendering.

**Tech Stack:** TypeScript, Node/Express + socket.io + SSE (backend), React + Vite + Tailwind (frontend), `tsx` runtime, new: `vitest` for both sides, `supertest` for backend HTTP tests, `@testing-library/react` + `jsdom` for frontend, `openai` SDK for the new provider.

**Spec:** [`docs/superpowers/specs/2026-04-22-unified-orchestrator-chat-design.md`](../specs/2026-04-22-unified-orchestrator-chat-design.md)

---

## Working Principles

- **TDD where it pays off.** Pure logic (parser, store, approve state machine, providers, UI components) is driven by tests. Pure refactor/deletion tasks (removing mode selector, deleting orphan file) use lint + typecheck + manual smoke as the gate. Every task lists its verification approach.
- **Frequent commits.** One commit per task.
- **No backward-compat shims.** `/chat` and `/instructions` go away in one commit (see Task 13). Persisted state from prior runs is discarded; `data/state.json` should be deleted as part of verification.
- **Only the orchestrator turn is provider-pluggable.** `createPlan`, clarifier, composer, report generator, per-agent execution stay on Claude CLI.

---

## File Structure

### Backend — New files

| File | Responsibility |
|------|----------------|
| `agent-dashboard/backend/src/messages/types.ts` | `Message` envelope + `PlanProposalItem` + `ExecutionStatus` enums |
| `agent-dashboard/backend/src/messages/store.ts` | Per-team `Map<string, Message[]>`; `append`, `get`, `findById`, `applyApproval` |
| `agent-dashboard/backend/src/messages/parser.ts` | `extractPlanProposal(text) -> PlanProposalPayload \| null` (stream-then-parse) |
| `agent-dashboard/backend/src/messages/prompt.ts` | `buildOrchestratorPrompt({ team, project, thread }) -> string` |
| `agent-dashboard/backend/src/messages/router.ts` | Express router: `GET /`, `POST /`, `POST /:msgId/approve` |
| `agent-dashboard/backend/src/messages/executionAdapter.ts` | Wraps `executePlanAndPhases` to emit `execution_status` messages tagged by `planMessageId` |
| `agent-dashboard/backend/src/providers/types.ts` | `OrchestratorProvider` interface |
| `agent-dashboard/backend/src/providers/claude.ts` | `ClaudeCliProvider` (wraps `spawn('claude', ...)`) |
| `agent-dashboard/backend/src/providers/openai.ts` | `OpenAIProvider` (uses `openai` SDK, Responses API streaming) |
| `agent-dashboard/backend/src/providers/factory.ts` | `resolveProvider(team): OrchestratorProvider` with env-default override |
| `agent-dashboard/backend/vitest.config.ts` | Vitest config |
| `agent-dashboard/backend/src/**/__tests__/*.test.ts` | Per-module unit + integration tests |

### Backend — Modified files

| File | Change |
|------|--------|
| `agent-dashboard/backend/package.json` | Add deps: `vitest`, `supertest`, `@types/supertest`, `openai` |
| `agent-dashboard/backend/server.ts` | Extend `Team` interface with `orchestratorProvider`, `orchestratorModel`; remove `POST /api/teams/:id/chat` (lines ~1445–1660) and `POST /api/teams/:id/instructions` (lines ~1316 onward); remove `chatHistories` map (line 1438); mount messages router; update team create/update to accept new fields; update `PersistedState` schema |

### Frontend — New files

| File | Responsibility |
|------|----------------|
| `agent-dashboard/frontend/src/components/MessageThread.tsx` | Renders `Message[]`; delegates per kind; groups `execution_status` under their `planMessageId` |
| `agent-dashboard/frontend/src/components/PlanProposalCard.tsx` | Per-item checkboxes + priority badges + approve/decline; POSTs to `/approve` |
| `agent-dashboard/frontend/src/components/ExecutionStatusRow.tsx` | Dim single-line system row with deterministic agent color + animated icon |
| `agent-dashboard/frontend/src/lib/agentColor.ts` | `agentColor(id): { bg, fg, dot }` — deterministic hash-based color picker |
| `agent-dashboard/frontend/vitest.config.ts` | Vitest config (uses Vite plugin-react) |
| `agent-dashboard/frontend/src/**/__tests__/*.test.tsx` | Component tests |

### Frontend — Modified files

| File | Change |
|------|--------|
| `agent-dashboard/frontend/package.json` | Add deps: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `@types/jest` (for matchers types) |
| `agent-dashboard/frontend/src/types.ts` | Add `Message`, `PlanProposalItem`, `ExecutionStatus`; extend `Team` with `orchestratorProvider`, `orchestratorModel` |
| `agent-dashboard/frontend/src/components/CommandCenter.tsx` | Drop `mode` state + tab/button UI + instruction history; become shell that fetches `/messages`, renders `MessageThread`, posts input |
| `agent-dashboard/frontend/src/components/CreateTeamModal.tsx` | Add provider radio + model dropdown |
| `agent-dashboard/frontend/src/components/ControlPanel.tsx` | Add provider/model editable fields |

### Frontend — Deleted files

| File | Reason |
|------|--------|
| `agent-dashboard/frontend/src/components/OrchestratorChat.tsx` | Orphaned (not imported anywhere), superseded by MessageThread |

---

## Tasks

Each task ends with a commit. Run backend tests with `cd agent-dashboard/backend && npx vitest run`. Run frontend tests with `cd agent-dashboard/frontend && npx vitest run`. When a step says "run it to confirm it fails", you are executing the TDD red phase — expect a failure message and do not proceed until you see one.

---

### Task 1: Bootstrap backend test harness

**Files:**
- Modify: `agent-dashboard/backend/package.json`
- Create: `agent-dashboard/backend/vitest.config.ts`
- Create: `agent-dashboard/backend/src/__tests__/smoke.test.ts`

- [ ] **Step 1: Add dev dependencies**

Run:

```bash
cd agent-dashboard/backend
npm install --save-dev vitest@^1.6.0 supertest@^7.0.0 @types/supertest@^6.0.2
```

Expected: `package.json` `devDependencies` now includes `vitest`, `supertest`, `@types/supertest`.

- [ ] **Step 2: Add `test` and `typecheck` scripts to `package.json`**

In `agent-dashboard/backend/package.json`, add to `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 10000,
  },
});
```

- [ ] **Step 4: Create smoke test**

File: `agent-dashboard/backend/src/__tests__/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest';

describe('backend test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `cd agent-dashboard/backend && npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add agent-dashboard/backend/package.json agent-dashboard/backend/package-lock.json \
        agent-dashboard/backend/vitest.config.ts \
        agent-dashboard/backend/src/__tests__/smoke.test.ts
git commit -m "chore(backend): add vitest harness"
```

---

### Task 2: Bootstrap frontend test harness

**Files:**
- Modify: `agent-dashboard/frontend/package.json`
- Modify: `agent-dashboard/frontend/vite.config.ts`
- Create: `agent-dashboard/frontend/src/test-setup.ts`
- Create: `agent-dashboard/frontend/src/__tests__/smoke.test.tsx`

- [ ] **Step 1: Add dev dependencies**

Run:

```bash
cd agent-dashboard/frontend
npm install --save-dev vitest@^1.6.0 jsdom@^24.0.0 \
  @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.4.0 \
  @testing-library/user-event@^14.5.0
```

- [ ] **Step 2: Add `test` script to `package.json`**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Update `vite.config.ts` to register vitest**

Open `agent-dashboard/frontend/vite.config.ts`. Add at top:

```ts
/// <reference types="vitest" />
```

Extend `defineConfig` with a `test` block:

```ts
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: ['./src/test-setup.ts'],
  include: ['src/**/*.test.{ts,tsx}'],
},
```

- [ ] **Step 4: Create `src/test-setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Create smoke test**

File: `agent-dashboard/frontend/src/__tests__/smoke.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('frontend test harness', () => {
  it('renders JSX', () => {
    render(<span>hello</span>);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd agent-dashboard/frontend && npm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add agent-dashboard/frontend/package.json agent-dashboard/frontend/package-lock.json \
        agent-dashboard/frontend/vite.config.ts \
        agent-dashboard/frontend/src/test-setup.ts \
        agent-dashboard/frontend/src/__tests__/smoke.test.tsx
git commit -m "chore(frontend): add vitest + testing-library harness"
```

---

### Task 3: Backend — Message envelope types

**Files:**
- Create: `agent-dashboard/backend/src/messages/types.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/types.test.ts`

- [ ] **Step 1: Write a compile-time test for the shape**

File: `agent-dashboard/backend/src/messages/__tests__/types.test.ts`

```ts
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
```

- [ ] **Step 2: Run the test, confirm compile-time failure**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/types.test.ts`
Expected: error — "Cannot find module '../types'" or similar.

- [ ] **Step 3: Implement the types**

File: `agent-dashboard/backend/src/messages/types.ts`

```ts
export type Priority = 'high' | 'medium' | 'low';

export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
}

export type ExecutionStatus = 'started' | 'progress' | 'completed' | 'failed';
export type Approval = 'pending' | 'approved' | 'declined';

export type Message =
  | {
      id: string; role: 'user' | 'assistant'; kind: 'text';
      content: string; createdAt: string;
    }
  | {
      id: string; role: 'assistant'; kind: 'plan_proposal';
      summary: string;
      items: PlanProposalItem[];
      approval: Approval;
      approvedItemIds?: string[];
      createdAt: string;
    }
  | {
      id: string; role: 'system'; kind: 'execution_status';
      planMessageId: string;
      phase: string;
      agentId?: string;
      status: ExecutionStatus;
      detail?: string;
      createdAt: string;
    };
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/types.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/types.ts \
        agent-dashboard/backend/src/messages/__tests__/types.test.ts
git commit -m "feat(messages): add Message envelope types"
```

---

### Task 4: Backend — Plan-proposal parser

**Files:**
- Create: `agent-dashboard/backend/src/messages/parser.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/parser.test.ts`

Parser contract: given the full assistant text, return a structured payload if a valid `plan_proposal` JSON block is present, else `null`. Fence detection: first `` ```json `` block OR first bare `{"kind":"plan_proposal", ...}` object. On any schema violation (missing required fields, duplicate item ids, empty items, unknown `priority`), return `null`.

- [ ] **Step 1: Write failing tests**

File: `agent-dashboard/backend/src/messages/__tests__/parser.test.ts`

```ts
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
```

- [ ] **Step 2: Run, confirm tests fail**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/parser.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement parser**

File: `agent-dashboard/backend/src/messages/parser.ts`

```ts
import type { PlanProposalItem, Priority } from './types';

export interface PlanProposalPayload {
  summary: string;
  items: PlanProposalItem[];
}

const VALID_PRIORITIES: ReadonlySet<Priority> = new Set(['high', 'medium', 'low']);

export function extractPlanProposal(fullText: string): PlanProposalPayload | null {
  const candidates: string[] = [];

  const fenceMatch = fullText.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) candidates.push(fenceMatch[1]);

  const braceMatch = fullText.match(/\{[\s\S]*\}/);
  if (braceMatch) candidates.push(braceMatch[0]);

  for (const raw of candidates) {
    const parsed = tryParse(raw);
    if (parsed) return parsed;
  }
  return null;
}

function tryParse(raw: string): PlanProposalPayload | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (o.kind !== 'plan_proposal') return null;
  if (typeof o.summary !== 'string' || !o.summary.trim()) return null;
  if (!Array.isArray(o.items) || o.items.length === 0) return null;

  const seen = new Set<string>();
  const items: PlanProposalItem[] = [];
  for (const rawItem of o.items) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const i = rawItem as Record<string, unknown>;
    if (typeof i.id !== 'string' || !i.id.trim()) return null;
    if (seen.has(i.id)) return null;
    seen.add(i.id);
    if (typeof i.title !== 'string' || !i.title.trim()) return null;
    if (typeof i.priority !== 'string' || !VALID_PRIORITIES.has(i.priority as Priority)) return null;
    items.push({
      id: i.id,
      title: i.title,
      detail: typeof i.detail === 'string' ? i.detail : undefined,
      priority: i.priority as Priority,
      suggestedAgent: typeof i.suggestedAgent === 'string' ? i.suggestedAgent : undefined,
    });
  }
  return { summary: o.summary, items };
}
```

- [ ] **Step 4: Run, confirm all pass**

Run: `cd agent-dashboard/backend && npx vitest run src/messages/__tests__/parser.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/parser.ts \
        agent-dashboard/backend/src/messages/__tests__/parser.test.ts
git commit -m "feat(messages): add plan-proposal parser"
```

---

### Task 5: Backend — Message store

**Files:**
- Create: `agent-dashboard/backend/src/messages/store.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/store.test.ts`

Store contract:

- `append(teamId, message)` — pushes into the team's array.
- `get(teamId)` — returns the array (empty if none).
- `findById(teamId, msgId)` — returns one message or undefined.
- `applyApproval(teamId, msgId, itemIds)` — transitions a `plan_proposal` to `approved` (or `declined` if `itemIds` is empty). Throws `AlreadyResolvedError` if already approved/declined, `NotFoundError` if msg missing or wrong kind, `InvalidItemsError` if any itemId isn't in the proposal.

- [ ] **Step 1: Write failing tests**

File: `agent-dashboard/backend/src/messages/__tests__/store.test.ts`

```ts
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
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement store**

File: `agent-dashboard/backend/src/messages/store.ts`

```ts
import type { Message } from './types';

export class NotFoundError extends Error {}
export class AlreadyResolvedError extends Error {}
export class InvalidItemsError extends Error {}

export class MessageStore {
  private byTeam = new Map<string, Message[]>();

  append(teamId: string, msg: Message): void {
    if (!this.byTeam.has(teamId)) this.byTeam.set(teamId, []);
    this.byTeam.get(teamId)!.push(msg);
  }

  get(teamId: string): Message[] {
    return this.byTeam.get(teamId) ?? [];
  }

  findById(teamId: string, msgId: string): Message | undefined {
    return this.byTeam.get(teamId)?.find(m => m.id === msgId);
  }

  applyApproval(teamId: string, msgId: string, itemIds: string[]): Message {
    const msg = this.findById(teamId, msgId);
    if (!msg || msg.kind !== 'plan_proposal') {
      throw new NotFoundError(`plan_proposal ${msgId} not found for team ${teamId}`);
    }
    if (msg.approval !== 'pending') {
      throw new AlreadyResolvedError(`already ${msg.approval}`);
    }
    const validIds = new Set(msg.items.map(i => i.id));
    for (const id of itemIds) {
      if (!validIds.has(id)) throw new InvalidItemsError(`unknown item ${id}`);
    }
    msg.approvedItemIds = [...itemIds];
    msg.approval = itemIds.length === 0 ? 'declined' : 'approved';
    return msg;
  }

  // Snapshot for persistence
  snapshot(): Record<string, Message[]> {
    const out: Record<string, Message[]> = {};
    for (const [k, v] of this.byTeam) out[k] = [...v];
    return out;
  }

  loadSnapshot(data: Record<string, Message[]>): void {
    this.byTeam.clear();
    for (const [k, v] of Object.entries(data)) this.byTeam.set(k, [...v]);
  }
}
```

- [ ] **Step 4: Run, confirm all pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/store.ts \
        agent-dashboard/backend/src/messages/__tests__/store.test.ts
git commit -m "feat(messages): add MessageStore with approval semantics"
```

---

### Task 6: Backend — OrchestratorProvider interface + ClaudeCliProvider

**Files:**
- Create: `agent-dashboard/backend/src/providers/types.ts`
- Create: `agent-dashboard/backend/src/providers/claude.ts`
- Create: `agent-dashboard/backend/src/providers/__tests__/claude.test.ts`

- [ ] **Step 1: Write failing test that mocks `child_process.spawn`**

File: `agent-dashboard/backend/src/providers/__tests__/claude.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ClaudeCliProvider } from '../claude';

function fakeProc(stdoutChunks: string[]) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: Readable; stderr: Readable; stdin: Writable; kill: () => void;
  };
  proc.stdout = Readable.from(stdoutChunks.map(s => Buffer.from(s)));
  proc.stderr = Readable.from([]);
  proc.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  proc.kill = () => {};
  // Emit 'close' after stdout drains — otherwise the close event can beat
  // the 'data' events and fullText will be empty.
  proc.stdout.on('end', () => setImmediate(() => proc.emit('close', 0)));
  return proc;
}

describe('ClaudeCliProvider', () => {
  beforeEach(() => { spawnMock.mockReset(); });

  it('streams chunks and returns fullText', async () => {
    spawnMock.mockReturnValue(fakeProc(['hello ', 'world']));
    const provider = new ClaudeCliProvider({ cwd: '/tmp' });
    const chunks: string[] = [];
    const out = await provider.streamTurn({
      prompt: 'p',
      model: 'sonnet',
      onChunk: c => chunks.push(c),
      signal: new AbortController().signal,
    });
    expect(chunks.join('')).toBe('hello world');
    expect(out.fullText).toBe('hello world');
    expect(spawnMock).toHaveBeenCalledWith('claude',
      ['--print', '--model', 'sonnet'],
      expect.objectContaining({ cwd: '/tmp' }));
  });

  it('passes model string through unchanged for opus/haiku', async () => {
    spawnMock.mockReturnValue(fakeProc(['x']));
    const provider = new ClaudeCliProvider({ cwd: '/tmp' });
    await provider.streamTurn({
      prompt: 'p', model: 'opus', onChunk: () => {},
      signal: new AbortController().signal,
    });
    expect(spawnMock).toHaveBeenCalledWith('claude',
      ['--print', '--model', 'opus'], expect.any(Object));
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement types + Claude provider**

File: `agent-dashboard/backend/src/providers/types.ts`

```ts
export interface StreamTurnArgs {
  prompt: string;
  model: string;
  onChunk: (text: string) => void;
  signal: AbortSignal;
}

export interface StreamTurnResult {
  fullText: string;
}

export interface OrchestratorProvider {
  streamTurn(args: StreamTurnArgs): Promise<StreamTurnResult>;
}
```

File: `agent-dashboard/backend/src/providers/claude.ts`

```ts
import { spawn } from 'node:child_process';
import type { OrchestratorProvider, StreamTurnArgs, StreamTurnResult } from './types';

export class ClaudeCliProvider implements OrchestratorProvider {
  constructor(private readonly opts: { cwd: string }) {}

  streamTurn({ prompt, model, onChunk, signal }: StreamTurnArgs): Promise<StreamTurnResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['--print', '--model', model], {
        cwd: this.opts.cwd,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard-chat' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let full = '';
      const onAbort = () => { try { proc.kill(); } catch {} };
      signal.addEventListener('abort', onAbort);

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (d: Buffer) => {
        const s = d.toString();
        full += s;
        onChunk(s);
      });

      proc.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      proc.on('close', () => {
        signal.removeEventListener('abort', onAbort);
        resolve({ fullText: full });
      });
    });
  }
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/providers/types.ts \
        agent-dashboard/backend/src/providers/claude.ts \
        agent-dashboard/backend/src/providers/__tests__/claude.test.ts
git commit -m "feat(providers): add OrchestratorProvider interface and Claude CLI impl"
```

---

### Task 7: Backend — OpenAIProvider

**Files:**
- Modify: `agent-dashboard/backend/package.json` (add `openai`)
- Create: `agent-dashboard/backend/src/providers/openai.ts`
- Create: `agent-dashboard/backend/src/providers/__tests__/openai.test.ts`

- [ ] **Step 1: Install the OpenAI SDK**

Run: `cd agent-dashboard/backend && npm install openai@^4.60.0`

- [ ] **Step 2: Write failing test**

File: `agent-dashboard/backend/src/providers/__tests__/openai.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';

const streamEvents = [
  { type: 'response.output_text.delta', delta: 'hel' },
  { type: 'response.output_text.delta', delta: 'lo' },
  { type: 'response.completed' },
];

async function* fakeStream() {
  for (const e of streamEvents) yield e;
}

const createMock = vi.fn(async () => fakeStream());

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = { stream: createMock };
  },
}));

import { OpenAIProvider } from '../openai';

describe('OpenAIProvider', () => {
  it('missing API key throws a clear error', async () => {
    delete process.env.OPENAI_API_KEY;
    const p = new OpenAIProvider();
    await expect(p.streamTurn({
      prompt: 'x', model: 'gpt-4o',
      onChunk: () => {}, signal: new AbortController().signal,
    })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('streams deltas and returns full text', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const chunks: string[] = [];
    const p = new OpenAIProvider();
    const out = await p.streamTurn({
      prompt: 'x', model: 'gpt-4o',
      onChunk: c => chunks.push(c),
      signal: new AbortController().signal,
    });
    expect(chunks.join('')).toBe('hello');
    expect(out.fullText).toBe('hello');
    expect(createMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, confirm fail (module-not-found)**

- [ ] **Step 4: Implement provider**

File: `agent-dashboard/backend/src/providers/openai.ts`

```ts
import OpenAI from 'openai';
import type { OrchestratorProvider, StreamTurnArgs, StreamTurnResult } from './types';

export class MissingOpenAiKeyError extends Error {
  constructor() { super('OPENAI_API_KEY is not set'); }
}

export class OpenAIProvider implements OrchestratorProvider {
  async streamTurn({ prompt, model, onChunk, signal }: StreamTurnArgs): Promise<StreamTurnResult> {
    if (!process.env.OPENAI_API_KEY) throw new MissingOpenAiKeyError();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.responses.stream({
      model,
      input: prompt,
    });

    let full = '';
    const onAbort = () => { try { (stream as unknown as { controller?: AbortController }).controller?.abort(); } catch {} };
    signal.addEventListener('abort', onAbort);

    try {
      for await (const event of stream as AsyncIterable<{ type: string; delta?: string }>) {
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          full += event.delta;
          onChunk(event.delta);
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    return { fullText: full };
  }
}
```

- [ ] **Step 5: Run, confirm pass**

- [ ] **Step 6: Commit**

```bash
git add agent-dashboard/backend/package.json agent-dashboard/backend/package-lock.json \
        agent-dashboard/backend/src/providers/openai.ts \
        agent-dashboard/backend/src/providers/__tests__/openai.test.ts
git commit -m "feat(providers): add OpenAI provider via Responses API"
```

---

### Task 8: Backend — Provider factory + Team config fields

**Files:**
- Modify: `agent-dashboard/backend/server.ts` (Team interface — see line 99)
- Create: `agent-dashboard/backend/src/providers/factory.ts`
- Create: `agent-dashboard/backend/src/providers/__tests__/factory.test.ts`

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/backend/src/providers/__tests__/factory.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../factory';
import { ClaudeCliProvider } from '../claude';
import { OpenAIProvider } from '../openai';

describe('resolveProvider', () => {
  it('returns Claude for orchestratorProvider=claude', () => {
    const p = resolveProvider(
      { orchestratorProvider: 'claude', orchestratorModel: 'sonnet' },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(ClaudeCliProvider);
  });

  it('returns OpenAI for orchestratorProvider=openai', () => {
    const p = resolveProvider(
      { orchestratorProvider: 'openai', orchestratorModel: 'gpt-4o' },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('defaults to claude when field missing', () => {
    const p = resolveProvider(
      { orchestratorProvider: undefined, orchestratorModel: undefined },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(ClaudeCliProvider);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement factory**

File: `agent-dashboard/backend/src/providers/factory.ts`

```ts
import { ClaudeCliProvider } from './claude';
import { OpenAIProvider } from './openai';
import type { OrchestratorProvider } from './types';

export type ProviderName = 'claude' | 'openai';

export interface TeamProviderConfig {
  orchestratorProvider: ProviderName | undefined;
  orchestratorModel: string | undefined;
}

export interface FactoryOpts {
  projectPath: string;
}

export function defaultProvider(): ProviderName {
  const env = (process.env.DEFAULT_ORCHESTRATOR_PROVIDER ?? '').toLowerCase();
  return env === 'openai' ? 'openai' : 'claude';
}

export function defaultModelFor(provider: ProviderName): string {
  return provider === 'openai' ? 'gpt-4o' : 'sonnet';
}

export function resolveProvider(
  cfg: TeamProviderConfig,
  opts: FactoryOpts,
): OrchestratorProvider {
  const name = cfg.orchestratorProvider ?? defaultProvider();
  if (name === 'openai') return new OpenAIProvider();
  return new ClaudeCliProvider({ cwd: opts.projectPath });
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Extend `Team` interface in server.ts**

In `agent-dashboard/backend/server.ts`, modify the `Team` interface (currently at line 99):

```ts
interface Team {
  id: string;
  name: string;
  phase: string;
  status: 'planning' | 'active' | 'paused' | 'complete';
  agents: Agent[];
  projectId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  orchestratorProvider?: 'claude' | 'openai';
  orchestratorModel?: string;
}
```

In the team-create handler (around line 1114), accept these from the request body and default them:

```ts
const newTeam: Team = {
  // ...existing fields...
  orchestratorProvider: req.body.orchestratorProvider ?? defaultProvider(),
  orchestratorModel: req.body.orchestratorModel
    ?? defaultModelFor(req.body.orchestratorProvider ?? defaultProvider()),
};
```

Add an import at the top of server.ts:

```ts
import { defaultProvider, defaultModelFor } from './src/providers/factory';
```

Add a new `PATCH /api/teams/:teamId` handler (no general team PATCH exists today — only `PATCH /api/teams/:teamId/project`). Place it near the other team endpoints:

```ts
app.patch('/api/teams/:teamId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const { orchestratorProvider, orchestratorModel } = req.body ?? {};
  if (orchestratorProvider === 'claude' || orchestratorProvider === 'openai') {
    team.orchestratorProvider = orchestratorProvider;
  }
  if (typeof orchestratorModel === 'string' && orchestratorModel.trim()) {
    team.orchestratorModel = orchestratorModel.trim();
  }
  io.emit('team:updated', team);
  res.json(team);
});
```

- [ ] **Step 6: Run full backend test suite**

Run: `cd agent-dashboard/backend && npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add agent-dashboard/backend/src/providers/factory.ts \
        agent-dashboard/backend/src/providers/__tests__/factory.test.ts \
        agent-dashboard/backend/server.ts
git commit -m "feat(providers): add factory and Team config fields"
```

---

### Task 9: Backend — Prompt builder

**Files:**
- Create: `agent-dashboard/backend/src/messages/prompt.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/prompt.test.ts`

Prompt contract: build a single string that primes the orchestrator to reply with either plain prose (for discussion) or a ```` ```json ```` block matching the `plan_proposal` shape (for actionable work). Include: project name/path, current agent roster, recent thread messages (last 10), and explicit format rules.

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/backend/src/messages/__tests__/prompt.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildOrchestratorPrompt } from '../prompt';
import type { Message } from '../types';

describe('buildOrchestratorPrompt', () => {
  const team = {
    id: 't1', name: 'Alpha',
    agents: [
      { id: 'a1', role: 'backend-architect', status: 'idle', progress: 0, name: 'Arch', model: 'sonnet' },
    ],
  };
  const project = { id: 'p1', name: 'Site', path: '/work/site' };

  it('contains project info and agent roster', () => {
    const prompt = buildOrchestratorPrompt({ team, project, thread: [] });
    expect(prompt).toContain('Site');
    expect(prompt).toContain('/work/site');
    expect(prompt).toContain('backend-architect');
  });

  it('documents the plan_proposal output shape', () => {
    const prompt = buildOrchestratorPrompt({ team, project, thread: [] });
    expect(prompt).toContain('plan_proposal');
    expect(prompt).toMatch(/priority/);
    expect(prompt).toMatch(/```json/);
  });

  it('includes last 10 messages from the thread (text only)', () => {
    const thread: Message[] = Array.from({ length: 15 }, (_, i) => ({
      id: `m${i}`, role: i % 2 === 0 ? 'user' : 'assistant', kind: 'text',
      content: `msg ${i}`, createdAt: new Date().toISOString(),
    }));
    const prompt = buildOrchestratorPrompt({ team, project, thread });
    expect(prompt).not.toContain('msg 0');
    expect(prompt).toContain('msg 14');
    expect(prompt).toContain('msg 5');
  });

  it('skips non-text messages in the recent window', () => {
    const thread: Message[] = [
      {
        id: 'p1', role: 'assistant', kind: 'plan_proposal',
        summary: 'should not leak', items: [{ id: 'i', title: 'x', priority: 'low' }],
        approval: 'pending', createdAt: new Date().toISOString(),
      },
      {
        id: 'u1', role: 'user', kind: 'text',
        content: 'the user said this', createdAt: new Date().toISOString(),
      },
    ];
    const prompt = buildOrchestratorPrompt({ team, project, thread });
    expect(prompt).toContain('the user said this');
    expect(prompt).not.toContain('should not leak');
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/messages/prompt.ts`

```ts
import type { Message } from './types';

export interface PromptTeam {
  id: string; name: string;
  agents: Array<{ id: string; role: string; status: string; progress: number; name: string; model: string }>;
}

export interface PromptProject {
  id: string; name: string; path: string;
}

export function buildOrchestratorPrompt(args: {
  team: PromptTeam;
  project: PromptProject;
  thread: Message[];
}): string {
  const { team, project, thread } = args;
  const agentList = team.agents.length
    ? team.agents.map(a => `- ${a.name} (role: ${a.role}, status: ${a.status})`).join('\n')
    : '(no agents on team)';

  const textThread = thread.filter((m): m is Extract<Message, { kind: 'text' }> => m.kind === 'text');
  const recent = textThread.slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'Orchestrator'}: ${m.content}`).join('\n\n');

  return [
    `You are the orchestrator for a development team. You can discuss and plan, AND you can propose concrete work to execute.`,
    ``,
    `Project: ${project.name} (${project.path})`,
    ``,
    `Current team:`,
    agentList,
    ``,
    `Response format — pick ONE of these two shapes per turn:`,
    ``,
    `1. Plain prose — for questions, analysis, advice, or when you need more info from the user. No special formatting.`,
    ``,
    `2. A plan proposal — when you have concrete, actionable work to suggest. Emit a single fenced JSON block like this:`,
    ``,
    '```json',
    `{`,
    `  "kind": "plan_proposal",`,
    `  "summary": "One short sentence describing the proposal.",`,
    `  "items": [`,
    `    { "id": "short-slug", "title": "One concrete task", "detail": "Optional specifics", "priority": "high", "suggestedAgent": "backend-architect" }`,
    `  ]`,
    `}`,
    '```',
    ``,
    `Rules for plan_proposal:`,
    `- 1–10 items, each with a unique id, a concrete title, and a priority of high, medium, or low.`,
    `- Items should be individually meaningful — the user picks which to approve.`,
    `- Prefer items that map to existing team agents when possible (use their role in "suggestedAgent").`,
    ``,
    `Recent conversation:`,
    recent || '(none)',
    ``,
    `Respond now.`,
  ].join('\n');
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/prompt.ts \
        agent-dashboard/backend/src/messages/__tests__/prompt.test.ts
git commit -m "feat(messages): add orchestrator prompt builder"
```

---

### Task 10: Backend — Messages router (GET + POST + SSE)

**Files:**
- Create: `agent-dashboard/backend/src/messages/router.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/router.test.ts`

Router responsibility: HTTP surface. Dependencies (store, provider factory, team lookup) are injected so tests can substitute stubs. The handler does NOT call `executePlanAndPhases` directly — that is wired in Task 12.

- [ ] **Step 1: Write failing router test (in isolation — no server.ts coupling)**

File: `agent-dashboard/backend/src/messages/__tests__/router.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MessageStore } from '../store';
import { createMessagesRouter } from '../router';
import type { OrchestratorProvider } from '../../providers/types';

function stubProvider(reply: string): OrchestratorProvider {
  return {
    async streamTurn({ onChunk }) {
      onChunk(reply);
      return { fullText: reply };
    },
  };
}

describe('messages router', () => {
  let app: express.Express;
  let store: MessageStore;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    store = new MessageStore();
    const team = {
      id: 't1', name: 'T', agents: [],
      orchestratorProvider: 'claude' as const, orchestratorModel: 'sonnet',
    };
    const project = { id: 'p1', name: 'P', path: '/tmp' };
    app.use('/api/teams/:teamId/messages', createMessagesRouter({
      store,
      getTeam: () => team,
      getProject: () => project,
      getProvider: () => stubProvider('plain text reply'),
      onApproved: () => {},
      emit: () => {},
    }));
  });

  it('GET returns empty list', async () => {
    const r = await request(app).get('/api/teams/t1/messages');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ messages: [] });
  });

  it('POST appends user text, streams assistant reply, stores as text', async () => {
    const r = await request(app).post('/api/teams/t1/messages').send({ content: 'hi' });
    expect(r.status).toBe(200);
    expect(r.text).toContain('plain text reply');
    const list = store.get('t1');
    expect(list).toHaveLength(2);
    expect(list[0].kind).toBe('text');
    expect(list[1].kind).toBe('text');
  });

  it('POST stores plan_proposal when assistant replies with json', async () => {
    const teamForPlan = {
      id: 't1', name: 'T', agents: [],
      orchestratorProvider: 'claude' as const, orchestratorModel: 'sonnet',
    };
    const app2 = express();
    app2.use(express.json());
    const store2 = new MessageStore();
    app2.use('/api/teams/:teamId/messages', createMessagesRouter({
      store: store2,
      getTeam: () => teamForPlan,
      getProject: () => ({ id: 'p1', name: 'P', path: '/tmp' }),
      getProvider: () => stubProvider('```json\n' + JSON.stringify({
        kind: 'plan_proposal', summary: 'do it',
        items: [{ id: 'a', title: 'A', priority: 'high' }],
      }) + '\n```'),
      onApproved: () => {},
      emit: () => {},
    }));
    await request(app2).post('/api/teams/t1/messages').send({ content: 'go' });
    const list = store2.get('t1');
    expect(list[1].kind).toBe('plan_proposal');
  });

  it('approve with itemIds marks approved and calls onApproved', async () => {
    // Seed a plan_proposal
    store.append('t1', {
      id: 'p1', role: 'assistant', kind: 'plan_proposal',
      summary: 's', items: [{ id: 'a', title: 'A', priority: 'high' }],
      approval: 'pending', createdAt: new Date().toISOString(),
    });
    const calls: unknown[] = [];
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/teams/:teamId/messages', createMessagesRouter({
      store,
      getTeam: () => ({ id: 't1', name: 'T', agents: [], orchestratorProvider: 'claude', orchestratorModel: 'sonnet' }),
      getProject: () => ({ id: 'p1', name: 'P', path: '/tmp' }),
      getProvider: () => stubProvider(''),
      onApproved: (...a) => calls.push(a),
      emit: () => {},
    }));

    const r = await request(app2).post('/api/teams/t1/messages/p1/approve').send({ itemIds: ['a'] });
    expect(r.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('approve with empty itemIds declines and does NOT call onApproved', async () => {
    store.append('t1', {
      id: 'p2', role: 'assistant', kind: 'plan_proposal',
      summary: 's', items: [{ id: 'a', title: 'A', priority: 'high' }],
      approval: 'pending', createdAt: new Date().toISOString(),
    });
    const calls: unknown[] = [];
    const r = await request(app).post('/api/teams/t1/messages/p2/approve').send({ itemIds: [] });
    expect(r.status).toBe(200);
    const msg = store.findById('t1', 'p2');
    expect(msg && msg.kind === 'plan_proposal' && msg.approval).toBe('declined');
    expect(calls).toHaveLength(0);
  });

  it('double-approve returns 409', async () => {
    store.append('t1', {
      id: 'p3', role: 'assistant', kind: 'plan_proposal',
      summary: 's', items: [{ id: 'a', title: 'A', priority: 'high' }],
      approval: 'approved', approvedItemIds: ['a'],
      createdAt: new Date().toISOString(),
    });
    const r = await request(app).post('/api/teams/t1/messages/p3/approve').send({ itemIds: ['a'] });
    expect(r.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement router**

File: `agent-dashboard/backend/src/messages/router.ts`

```ts
import express, { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { OrchestratorProvider } from '../providers/types';
import { MessageStore, AlreadyResolvedError, InvalidItemsError, NotFoundError } from './store';
import type { Message } from './types';
import { extractPlanProposal } from './parser';
import { buildOrchestratorPrompt } from './prompt';
import type { PromptTeam, PromptProject } from './prompt';

interface TeamWithProviderConfig extends PromptTeam {
  orchestratorProvider: 'claude' | 'openai';
  orchestratorModel: string;
}

export interface MessagesDeps {
  store: MessageStore;
  getTeam: (teamId: string) => TeamWithProviderConfig | undefined;
  getProject: (teamId: string) => PromptProject | undefined;
  getProvider: (team: TeamWithProviderConfig, project: PromptProject) => OrchestratorProvider;
  onApproved: (teamId: string, planMessageId: string, itemIds: string[]) => void;
  emit: (event: string, payload: unknown) => void;
}

export function createMessagesRouter(deps: MessagesDeps): Router {
  const r = express.Router({ mergeParams: true });

  r.get('/', (req, res) => {
    res.json({ messages: deps.store.get(req.params.teamId) });
  });

  r.post('/', async (req, res) => {
    const { teamId } = req.params as { teamId: string };
    const team = deps.getTeam(teamId);
    const project = deps.getProject(teamId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (!project) return res.status(400).json({ error: 'No project assigned' });

    const content = String(req.body?.content ?? '').trim();
    if (!content) return res.status(400).json({ error: 'empty content' });

    const userMsg: Message = {
      id: randomUUID(), role: 'user', kind: 'text',
      content, createdAt: new Date().toISOString(),
    };
    deps.store.append(teamId, userMsg);
    deps.emit('chat:message', { teamId, message: userMsg });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const prompt = buildOrchestratorPrompt({ team, project, thread: deps.store.get(teamId) });
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    let full = '';
    try {
      const provider = deps.getProvider(team, project);
      const result = await provider.streamTurn({
        prompt,
        model: team.orchestratorModel,
        onChunk: (c) => {
          full += c;
          try { res.write(`data: ${JSON.stringify({ chunk: c })}\n\n`); } catch {}
        },
        signal: controller.signal,
      });
      full = result.fullText;
    } catch (err) {
      const errMsg: Message = {
        id: randomUUID(), role: 'assistant', kind: 'text',
        content: `Provider error: ${(err as Error).message}`,
        createdAt: new Date().toISOString(),
      };
      deps.store.append(teamId, errMsg);
      deps.emit('chat:message', { teamId, message: errMsg });
      try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); } catch {}
      return;
    }

    const plan = full.trim() ? extractPlanProposal(full) : null;
    const assistantMsg: Message = plan
      ? {
          id: randomUUID(), role: 'assistant', kind: 'plan_proposal',
          summary: plan.summary, items: plan.items, approval: 'pending',
          createdAt: new Date().toISOString(),
        }
      : {
          id: randomUUID(), role: 'assistant', kind: 'text',
          content: full, createdAt: new Date().toISOString(),
        };
    deps.store.append(teamId, assistantMsg);
    deps.emit('chat:message', { teamId, message: assistantMsg });

    try { res.write(`data: ${JSON.stringify({ done: true })}\n\n`); res.end(); } catch {}
  });

  r.post('/:msgId/approve', (req, res) => {
    const { teamId, msgId } = req.params as { teamId: string; msgId: string };
    const itemIds: unknown = req.body?.itemIds;
    if (!Array.isArray(itemIds) || itemIds.some(x => typeof x !== 'string')) {
      return res.status(400).json({ error: 'itemIds must be string[]' });
    }

    try {
      const msg = deps.store.applyApproval(teamId, msgId, itemIds as string[]);
      deps.emit('chat:message', { teamId, message: msg });
      if (msg.kind === 'plan_proposal' && msg.approval === 'approved') {
        deps.onApproved(teamId, msg.id, msg.approvedItemIds ?? []);
      }
      return res.json({ message: msg });
    } catch (err) {
      if (err instanceof AlreadyResolvedError) return res.status(409).json({ error: err.message });
      if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
      if (err instanceof InvalidItemsError) return res.status(400).json({ error: err.message });
      throw err;
    }
  });

  return r;
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/router.ts \
        agent-dashboard/backend/src/messages/__tests__/router.test.ts
git commit -m "feat(messages): add unified /messages router with stream-then-parse"
```

---

### Task 11: Backend — Execution adapter (plan → execution_status stream)

**Files:**
- Create: `agent-dashboard/backend/src/messages/executionAdapter.ts`
- Create: `agent-dashboard/backend/src/messages/__tests__/executionAdapter.test.ts`

Adapter contract: `onExecutionEvent(teamId, planMessageId, event)` appends an `execution_status` message to the store and emits it. This is the seam that `executePlanAndPhases` will call via thin hooks in server.ts.

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/backend/src/messages/__tests__/executionAdapter.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { createExecutionAdapter } from '../executionAdapter';
import { MessageStore } from '../store';

describe('executionAdapter', () => {
  it('emits execution_status messages linked to plan', () => {
    const store = new MessageStore();
    const emit = vi.fn();
    const adapter = createExecutionAdapter({ store, emit });

    adapter.emitEvent('t1', 'plan1', {
      phase: 'planning', status: 'started', agentId: 'a1',
    });
    adapter.emitEvent('t1', 'plan1', {
      phase: 'planning', status: 'completed', agentId: 'a1',
    });

    const msgs = store.get('t1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      kind: 'execution_status', planMessageId: 'plan1',
      phase: 'planning', status: 'started', agentId: 'a1',
    });
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/backend/src/messages/executionAdapter.ts`

```ts
import { randomUUID } from 'node:crypto';
import { MessageStore } from './store';
import type { ExecutionStatus, Message } from './types';

export interface ExecutionEvent {
  phase: string;
  status: ExecutionStatus;
  agentId?: string;
  detail?: string;
}

export interface ExecutionAdapter {
  emitEvent(teamId: string, planMessageId: string, evt: ExecutionEvent): void;
}

export function createExecutionAdapter(deps: {
  store: MessageStore;
  emit: (event: string, payload: unknown) => void;
}): ExecutionAdapter {
  return {
    emitEvent(teamId, planMessageId, evt) {
      const msg: Message = {
        id: randomUUID(),
        role: 'system',
        kind: 'execution_status',
        planMessageId,
        phase: evt.phase,
        status: evt.status,
        agentId: evt.agentId,
        detail: evt.detail,
        createdAt: new Date().toISOString(),
      };
      deps.store.append(teamId, msg);
      deps.emit('chat:message', { teamId, message: msg });
    },
  };
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/backend/src/messages/executionAdapter.ts \
        agent-dashboard/backend/src/messages/__tests__/executionAdapter.test.ts
git commit -m "feat(messages): add execution-status adapter"
```

---

### Task 12: Backend — Wire messages router into server.ts + approve→execute

**Files:**
- Modify: `agent-dashboard/backend/server.ts`

This is the integration task. It touches several places in the large `server.ts`.

- [ ] **Step 1: Add imports at top of server.ts**

```ts
import { MessageStore } from './src/messages/store';
import { createMessagesRouter } from './src/messages/router';
import { createExecutionAdapter } from './src/messages/executionAdapter';
import { resolveProvider } from './src/providers/factory';
```

- [ ] **Step 2: Instantiate store + adapter near other state (around line 143)**

```ts
const messageStore = new MessageStore();
const executionAdapter = createExecutionAdapter({
  store: messageStore,
  emit: (event, payload) => io.emit(event, payload),
});
```

- [ ] **Step 3: Add `onApproved` bridge to `executePlanAndPhases`**

Still in server.ts, add above the endpoint registration:

```ts
async function dispatchApprovedPlan(teamId: string, planMessageId: string, itemIds: string[]) {
  const team = teamsState.get(teamId);
  if (!team || !team.projectId) return;
  const project = projectsState.get(team.projectId);
  if (!project) return;

  const planMsg = messageStore.findById(teamId, planMessageId);
  if (!planMsg || planMsg.kind !== 'plan_proposal') return;

  const selected = planMsg.items.filter(i => itemIds.includes(i.id));
  const instructionText = [
    planMsg.summary,
    ...selected.map(i => `- ${i.title}${i.detail ? `: ${i.detail}` : ''}`),
  ].join('\n');

  const instr: Instruction = {
    id: `instr-${Math.random().toString(36).slice(2, 11)}`,
    teamId,
    projectId: team.projectId,
    content: instructionText,
    status: 'executing',
    createdAt: new Date().toISOString(),
  };
  instructionsState.push(instr);
  io.emit('instruction:updated', instr);

  // Emit an initial "started" execution_status so the UI reacts immediately.
  executionAdapter.emitEvent(teamId, planMessageId, { phase: 'planning', status: 'started' });

  // NOTE: executePlanAndPhases uses addLog/agent updates internally; we
  // additionally emit execution_status messages at phase boundaries by
  // wrapping the existing addLog hooks (see Step 4).
  try {
    await executePlanAndPhases(team, instructionText, project, instr);
    executionAdapter.emitEvent(teamId, planMessageId, { phase: 'complete', status: 'completed' });
  } catch (err) {
    executionAdapter.emitEvent(teamId, planMessageId, {
      phase: 'complete', status: 'failed', detail: (err as Error).message,
    });
  }
}
```

- [ ] **Step 4: Bridge phase-level events into the adapter**

Find `executePlanAndPhases` (around line 945) — it already emits `phase:updated` at phase start/end. Immediately after each `io.emit('phase:updated', ...)`, add (inside the for-loop, while the approved plan message id is accessible via a closure):

This requires passing the `planMessageId` through the function signature. Extend the signature:

```ts
async function executePlanAndPhases(
  team: Team, instruction: string, project: Project,
  instructionObj?: Instruction, planMessageId?: string
) {
```

Update the two call sites of `executePlanAndPhases` (including `dispatchApprovedPlan` and any existing callers in `executeOrchestrationAfterComposition` / `orchestrateTeam`) to pass `planMessageId` through when available.

Inside the phase loop, where `phases[i].status = 'in-progress'` is set:

```ts
if (planMessageId) executionAdapter.emitEvent(team.id, planMessageId, {
  phase: phase.name, status: 'started',
});
```

Where `phases[i].status = 'complete'`:

```ts
if (planMessageId) executionAdapter.emitEvent(team.id, planMessageId, {
  phase: phase.name, status: 'completed',
});
```

When an agent completes inside `executePhase`, pass `planMessageId` down one more level or emit a generic "progress" event from the phase wrapper for each agent change. For v1, per-phase start/complete is sufficient — per-agent events are a nice-to-have, not a requirement.

- [ ] **Step 5: Mount the router**

Below the existing route registrations:

```ts
app.use('/api/teams/:teamId/messages', createMessagesRouter({
  store: messageStore,
  getTeam: (teamId) => {
    const t = teamsState.get(teamId);
    if (!t) return undefined;
    return {
      ...t,
      orchestratorProvider: t.orchestratorProvider ?? defaultProvider(),
      orchestratorModel: t.orchestratorModel
        ?? defaultModelFor(t.orchestratorProvider ?? defaultProvider()),
    };
  },
  getProject: (teamId) => {
    const t = teamsState.get(teamId);
    if (!t?.projectId) return undefined;
    return projectsState.get(t.projectId);
  },
  getProvider: (team, project) => resolveProvider(
    { orchestratorProvider: team.orchestratorProvider, orchestratorModel: team.orchestratorModel },
    { projectPath: project.path },
  ),
  onApproved: (teamId, planMessageId, itemIds) => {
    dispatchApprovedPlan(teamId, planMessageId, itemIds).catch(err => console.error('dispatch failed', err));
  },
  emit: (event, payload) => io.emit(event, payload),
}));
```

- [ ] **Step 6: Persistence — include messages in `PersistedState`**

In the `PersistedState` interface and `saveState()` / `loadState()`:

```ts
interface PersistedState {
  projects: Project[];
  teams: Team[];
  instructions: Instruction[];
  results: AgentResult[];
  messages?: Record<string, Message[]>;
}
```

In `saveState`:

```ts
const data: PersistedState = {
  // ...existing...
  messages: messageStore.snapshot(),
};
```

In `loadState`:

```ts
if (data.messages) messageStore.loadSnapshot(data.messages);
```

Remove the `chatHistories?:` field and its save/load logic — it is replaced by `messages`.

Also import `Message` at top:

```ts
import type { Message } from './src/messages/types';
```

- [ ] **Step 7: Typecheck the whole backend**

Run: `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors. Fix any type errors from the added imports/signatures.

- [ ] **Step 8: Delete the stale persisted state for a clean boot**

```bash
rm -f agent-dashboard/backend/data/state.json
```

(The server will recreate it.)

- [ ] **Step 9: Run the full test suite**

Run: `cd agent-dashboard/backend && npm test`
Expected: all tests pass.

- [ ] **Step 10: Manual smoke — backend alive**

Run in one terminal: `cd agent-dashboard/backend && npm run dev`
In another: `curl -s http://localhost:3001/api/teams` → expect JSON (possibly empty teams).

- [ ] **Step 11: Commit**

```bash
git add agent-dashboard/backend/server.ts
git commit -m "feat(backend): wire messages router and approve→execute bridge"
```

---

### Task 13: Backend — Remove legacy `/chat` and `/instructions` POSTs

**Files:**
- Modify: `agent-dashboard/backend/server.ts`

This task runs **after** Task 19 (the CommandCenter rewrite) has replaced all frontend consumers of `/chat` and `/instructions`. If Task 13 is done before Task 19, skip this task and run it after 19. Reorder locally if the executor picks a different order.

- [ ] **Step 1: Delete `POST` and `GET /api/teams/:teamId/chat`**

Remove the handler block that begins around line 1445 (`app.post('/api/teams/:teamId/chat', ...)`) and continues through its `proc.on('close')` / `proc.on('error')` handlers (ends around line 1665). Also delete `GET /api/teams/:teamId/chat` (line 1440). Also delete the `chatHistories` map declaration (line 1438).

- [ ] **Step 2: Delete `POST /api/teams/:teamId/instructions`**

Remove the handler around line 1316. The `GET /api/teams/:teamId/instructions` becomes unused after Task 19 and should be deleted in this step as well.

- [ ] **Step 3: Delete the advisory-only system prompt string**

The prompt at `server.ts:1594` goes away with its handler.

- [ ] **Step 4: Delete any now-unused helpers**

Search for references to `chatHistories` — there are pushes inside `orchestrateTeam` / `executeOrchestration` (around lines 860, 917, 1050). Replace each with a call to `messageStore.append(team.id, { id: randomUUID(), role: 'assistant', kind: 'text', content: <same string>, createdAt: new Date().toISOString() })` plus an `io.emit('chat:message', ...)`. This preserves the clarification/composition conversational flow in the new unified thread.

Import `randomUUID` if not already imported:

```ts
import { randomUUID } from 'node:crypto';
```

- [ ] **Step 4a: Add a smoke test for the reroute**

Extract a small helper that does the `messageStore.append + io.emit` pair (e.g., `emitAssistantText(teamId, content)`) and export it. Add a test:

File: `agent-dashboard/backend/src/messages/__tests__/emitAssistantText.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { MessageStore } from '../store';
import { createEmitAssistantText } from '../emitAssistantText';

describe('emitAssistantText', () => {
  it('appends a text message and emits chat:message', () => {
    const store = new MessageStore();
    const emit = vi.fn();
    const emitText = createEmitAssistantText({ store, emit });

    emitText('t1', 'I have a question for you.');

    const msgs = store.get('t1');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      role: 'assistant', kind: 'text',
      content: 'I have a question for you.',
    });
    expect(emit).toHaveBeenCalledWith('chat:message',
      expect.objectContaining({ teamId: 't1' }));
  });
});
```

Implement as:

File: `agent-dashboard/backend/src/messages/emitAssistantText.ts`

```ts
import { randomUUID } from 'node:crypto';
import type { MessageStore } from './store';

export function createEmitAssistantText(deps: {
  store: MessageStore;
  emit: (event: string, payload: unknown) => void;
}) {
  return function emit(teamId: string, content: string): void {
    const msg = {
      id: randomUUID(),
      role: 'assistant' as const,
      kind: 'text' as const,
      content,
      createdAt: new Date().toISOString(),
    };
    deps.store.append(teamId, msg);
    deps.emit('chat:message', { teamId, message: msg });
  };
}
```

Then use it at the three sites in `orchestrateTeam` / `executeOrchestration` in place of ad-hoc `chatHistories` pushes.

- [ ] **Step 5: Typecheck**

Run: `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Run tests**

Run: `cd agent-dashboard/backend && npm test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add agent-dashboard/backend/server.ts
git commit -m "refactor(backend): remove legacy chat/instructions POSTs, route clarify flow through messageStore"
```

---

### Task 14: Frontend — Message types + delete OrchestratorChat

**Files:**
- Modify: `agent-dashboard/frontend/src/types.ts`
- Delete: `agent-dashboard/frontend/src/components/OrchestratorChat.tsx`

- [ ] **Step 1: Add Message types**

In `agent-dashboard/frontend/src/types.ts`, append:

```ts
export type Priority = 'high' | 'medium' | 'low';

export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
}

export type ExecutionStatusCode = 'started' | 'progress' | 'completed' | 'failed';
export type Approval = 'pending' | 'approved' | 'declined';

export type Message =
  | { id: string; role: 'user' | 'assistant'; kind: 'text';
      content: string; createdAt: string }
  | { id: string; role: 'assistant'; kind: 'plan_proposal';
      summary: string; items: PlanProposalItem[];
      approval: Approval; approvedItemIds?: string[];
      createdAt: string }
  | { id: string; role: 'system'; kind: 'execution_status';
      planMessageId: string; phase: string;
      agentId?: string; status: ExecutionStatusCode;
      detail?: string; createdAt: string };
```

And extend the existing `Team` interface:

```ts
export interface Team {
  // ...existing...
  orchestratorProvider?: 'claude' | 'openai';
  orchestratorModel?: string;
}
```

- [ ] **Step 2: Delete orphan component**

```bash
rm agent-dashboard/frontend/src/components/OrchestratorChat.tsx
```

- [ ] **Step 3: Typecheck**

Run: `cd agent-dashboard/frontend && npx tsc -b --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add agent-dashboard/frontend/src/types.ts
git add agent-dashboard/frontend/src/components/OrchestratorChat.tsx
git commit -m "refactor(frontend): add Message types and delete orphan OrchestratorChat"
```

---

### Task 15: Frontend — agentColor helper

**Files:**
- Create: `agent-dashboard/frontend/src/lib/agentColor.ts`
- Create: `agent-dashboard/frontend/src/lib/__tests__/agentColor.test.ts`

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/frontend/src/lib/__tests__/agentColor.test.ts`

```ts
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
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/frontend/src/lib/agentColor.ts`

```ts
const PALETTE = [
  { bg: 'bg-sky-500/20',      fg: 'text-sky-300',    dot: 'bg-sky-400' },
  { bg: 'bg-emerald-500/20',  fg: 'text-emerald-300',dot: 'bg-emerald-400' },
  { bg: 'bg-amber-500/20',    fg: 'text-amber-300',  dot: 'bg-amber-400' },
  { bg: 'bg-fuchsia-500/20',  fg: 'text-fuchsia-300',dot: 'bg-fuchsia-400' },
  { bg: 'bg-violet-500/20',   fg: 'text-violet-300', dot: 'bg-violet-400' },
  { bg: 'bg-rose-500/20',     fg: 'text-rose-300',   dot: 'bg-rose-400' },
  { bg: 'bg-lime-500/20',     fg: 'text-lime-300',   dot: 'bg-lime-400' },
  { bg: 'bg-cyan-500/20',     fg: 'text-cyan-300',   dot: 'bg-cyan-400' },
];

export function agentColor(key: string): typeof PALETTE[number] {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/frontend/src/lib/agentColor.ts \
        agent-dashboard/frontend/src/lib/__tests__/agentColor.test.ts
git commit -m "feat(frontend): add deterministic agentColor helper"
```

---

### Task 16: Frontend — ExecutionStatusRow

**Files:**
- Create: `agent-dashboard/frontend/src/components/ExecutionStatusRow.tsx`
- Create: `agent-dashboard/frontend/src/components/__tests__/ExecutionStatusRow.test.tsx`

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/frontend/src/components/__tests__/ExecutionStatusRow.test.tsx`

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExecutionStatusRow from '../ExecutionStatusRow';

describe('ExecutionStatusRow', () => {
  const base = {
    id: 'e1', role: 'system' as const, kind: 'execution_status' as const,
    planMessageId: 'p1', phase: 'planning',
    createdAt: new Date().toISOString(),
  };

  it('shows phase and status', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'started', agentId: 'a-42' }} />);
    expect(screen.getByText(/planning/)).toBeInTheDocument();
    expect(screen.getByText(/started/i)).toBeInTheDocument();
  });

  it('shows a pulsing dot when status is progress', () => {
    const { container } = render(
      <ExecutionStatusRow msg={{ ...base, status: 'progress', agentId: 'a' }} />
    );
    expect(container.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows a check glyph when completed', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'completed', agentId: 'a' }} />);
    expect(screen.getByText(/✓/)).toBeInTheDocument();
  });

  it('shows a cross glyph when failed', () => {
    render(<ExecutionStatusRow msg={{ ...base, status: 'failed', agentId: 'a' }} />);
    expect(screen.getByText(/✗/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/frontend/src/components/ExecutionStatusRow.tsx`

```tsx
import { agentColor } from '../lib/agentColor';
import type { Message } from '../types';

type Props = {
  msg: Extract<Message, { kind: 'execution_status' }>;
  agentName?: string;
};

export default function ExecutionStatusRow({ msg, agentName }: Props) {
  const color = agentColor(msg.agentId ?? msg.phase);
  const glyph =
    msg.status === 'completed' ? '✓' :
    msg.status === 'failed'    ? '✗' :
    '·';
  const dotCls =
    msg.status === 'progress' ? `${color.dot} animate-pulse` :
    msg.status === 'started'  ? `${color.dot} animate-pulse` :
    color.dot;
  return (
    <div className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${color.bg}`}>
      <span className={`w-2 h-2 rounded-full ${dotCls}`} />
      <span className={color.fg}>{agentName ?? msg.agentId ?? 'orchestrator'}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-400">{msg.phase}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-300">{glyph} {msg.status}</span>
      {msg.detail && <span className="text-gray-500 truncate">— {msg.detail}</span>}
    </div>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/frontend/src/components/ExecutionStatusRow.tsx \
        agent-dashboard/frontend/src/components/__tests__/ExecutionStatusRow.test.tsx
git commit -m "feat(frontend): add ExecutionStatusRow component"
```

---

### Task 17: Frontend — PlanProposalCard

**Files:**
- Create: `agent-dashboard/frontend/src/components/PlanProposalCard.tsx`
- Create: `agent-dashboard/frontend/src/components/__tests__/PlanProposalCard.test.tsx`

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/frontend/src/components/__tests__/PlanProposalCard.test.tsx`

```tsx
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
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/frontend/src/components/PlanProposalCard.tsx`

```tsx
import { useState } from 'react';
import type { Message, Priority } from '../types';

type Plan = Extract<Message, { kind: 'plan_proposal' }>;

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'bg-red-500/20 text-red-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low: 'bg-gray-500/20 text-gray-300',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'HIGH', medium: 'MED', low: 'LOW',
};

export default function PlanProposalCard({
  plan,
  onResolve,
}: {
  plan: Plan;
  onResolve: (itemIds: string[]) => Promise<void>;
}) {
  const locked = plan.approval !== 'pending';
  const [checked, setChecked] = useState<Set<string>>(
    new Set(plan.approvedItemIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    if (locked) return;
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async (ids: string[]) => {
    setSubmitting(true);
    try { await onResolve(ids); } finally { setSubmitting(false); }
  };

  return (
    <div className="border border-gray-700 bg-gray-800 rounded-lg p-4 max-w-[90%]">
      <div className="text-sm font-semibold mb-2 text-gray-200">{plan.summary}</div>
      <ul className="space-y-1.5 mb-3">
        {plan.items.map(item => {
          const isChecked = checked.has(item.id);
          const wasApproved = (plan.approvedItemIds ?? []).includes(item.id);
          return (
            <li key={item.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={`item-${plan.id}-${item.id}`}
                checked={isChecked || (locked && wasApproved)}
                disabled={locked || submitting}
                onChange={() => toggle(item.id)}
                className="mt-1"
              />
              <label htmlFor={`item-${plan.id}-${item.id}`} className="flex-1 text-sm text-gray-200">
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${PRIORITY_STYLE[item.priority]}`}>
                  {PRIORITY_LABEL[item.priority]}
                </span>
                {item.title}
                {item.detail && <div className="text-xs text-gray-400 mt-0.5">{item.detail}</div>}
                {item.suggestedAgent && (
                  <div className="text-[10px] text-indigo-300 mt-0.5">→ {item.suggestedAgent}</div>
                )}
                {locked && wasApproved && <span className="ml-2 text-green-400">✓</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <button
          onClick={() => submit([...checked])}
          disabled={locked || submitting || checked.size === 0}
          className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded px-3 py-1 text-white"
        >
          {submitting ? '...' : 'Approve selected'}
        </button>
        <button
          onClick={() => submit([])}
          disabled={locked || submitting}
          className="text-sm bg-gray-700 hover:bg-gray-600 disabled:cursor-not-allowed rounded px-3 py-1 text-gray-200"
        >
          Decline
        </button>
        {locked && (
          <span className="text-xs ml-auto">
            {plan.approval === 'approved' ? (
              <span className="text-green-400">Approved</span>
            ) : (
              <span className="text-gray-400">Declined</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/frontend/src/components/PlanProposalCard.tsx \
        agent-dashboard/frontend/src/components/__tests__/PlanProposalCard.test.tsx
git commit -m "feat(frontend): add PlanProposalCard with per-item approval"
```

---

### Task 18: Frontend — MessageThread

**Files:**
- Create: `agent-dashboard/frontend/src/components/MessageThread.tsx`
- Create: `agent-dashboard/frontend/src/components/__tests__/MessageThread.test.tsx`

- [ ] **Step 1: Write failing test**

File: `agent-dashboard/frontend/src/components/__tests__/MessageThread.test.tsx`

```tsx
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
```

- [ ] **Step 2: Run, confirm fail**

- [ ] **Step 3: Implement**

File: `agent-dashboard/frontend/src/components/MessageThread.tsx`

```tsx
import type { Message } from '../types';
import PlanProposalCard from './PlanProposalCard';
import ExecutionStatusRow from './ExecutionStatusRow';

export default function MessageThread({
  messages,
  onApprove,
}: {
  messages: Message[];
  onApprove: (planMessageId: string, itemIds: string[]) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {messages.map(msg => {
        if (msg.kind === 'text') {
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                msg.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-gray-700/80 text-gray-200'
              }`}>
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
              </div>
            </div>
          );
        }
        if (msg.kind === 'plan_proposal') {
          return (
            <div key={msg.id} className="flex justify-start">
              <PlanProposalCard
                plan={msg}
                onResolve={(ids) => onApprove(msg.id, ids)}
              />
            </div>
          );
        }
        // execution_status
        return <ExecutionStatusRow key={msg.id} msg={msg} />;
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/frontend/src/components/MessageThread.tsx \
        agent-dashboard/frontend/src/components/__tests__/MessageThread.test.tsx
git commit -m "feat(frontend): add MessageThread rendering for all three kinds"
```

---

### Task 19: Frontend — Rewrite CommandCenter

**Files:**
- Modify: `agent-dashboard/frontend/src/components/CommandCenter.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite `agent-dashboard/frontend/src/components/CommandCenter.tsx` with:

```tsx
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Message } from '../types';
import MessageThread from './MessageThread';

const API = 'http://localhost:3001';
const socket = io(API);

export default function CommandCenter({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/teams/${teamId}/messages`)
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
  }, [teamId]);

  useEffect(() => {
    const onMsg = ({ teamId: tid, message }: { teamId: string; message: Message }) => {
      if (tid !== teamId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) {
          return prev.map(m => m.id === message.id ? message : m);
        }
        return [...prev, message];
      });
    };
    socket.on('chat:message', onMsg);
    return () => { socket.off('chat:message', onMsg); };
  }, [teamId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || streaming) return;
    setInput('');
    setStreaming(true);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
          // We rely on the socket 'chat:message' events for canonical state;
          // SSE chunks are only used to show "streaming..." indicator.
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  const approve = async (planMessageId: string, itemIds: string[]) => {
    const res = await fetch(`${API}/api/teams/${teamId}/messages/${planMessageId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    });
    if (!res.ok) throw new Error(`approve failed: ${res.status}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/80">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Command Center</h2>
          <span className="text-xs text-gray-500">{teamName}</span>
          {streaming && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium animate-pulse">
              streaming
            </span>
          )}
        </div>
      </div>
      <div className="p-5">
        <div className="max-h-96 overflow-y-auto mb-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          {messages.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              Tell the orchestrator what you want. It'll reply, or propose a plan you can approve.
            </p>
          ) : (
            <MessageThread messages={messages} onApprove={approve} />
          )}
          <div ref={endRef} />
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask or tell the orchestrator..."
          rows={3}
          disabled={streaming}
          className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-4 py-3 text-sm resize-none focus:border-blue-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-gray-600">Enter to send · Shift+Enter for newline</span>
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="text-sm rounded-lg px-5 py-1.5 font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white"
          >
            {streaming ? 'Streaming...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd agent-dashboard/frontend && npx tsc -b --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Run tests**

Run: `cd agent-dashboard/frontend && npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add agent-dashboard/frontend/src/components/CommandCenter.tsx
git commit -m "refactor(frontend): collapse CommandCenter to unified thread"
```

---

### Task 20: Frontend — Provider selection in CreateTeamModal + ControlPanel

**Files:**
- Modify: `agent-dashboard/frontend/src/components/CreateTeamModal.tsx`
- Modify: `agent-dashboard/frontend/src/components/ControlPanel.tsx`

- [ ] **Step 1: Add model lists constant**

In both files, add near the top:

```ts
const PROVIDER_MODELS: Record<'claude' | 'openai', string[]> = {
  claude: ['sonnet', 'opus', 'haiku'],
  openai: ['gpt-4o', 'gpt-5', 'o3-mini'],
};
```

- [ ] **Step 2: `CreateTeamModal` — add state and fields**

Introduce state:

```tsx
const [provider, setProvider] = useState<'claude' | 'openai'>('claude');
const [model, setModel] = useState<string>('sonnet');
```

Reset `model` when `provider` changes:

```tsx
useEffect(() => { setModel(PROVIDER_MODELS[provider][0]); }, [provider]);
```

Add UI somewhere in the form (before the submit button):

```tsx
<div className="space-y-2">
  <label className="text-xs text-gray-400">Orchestrator provider</label>
  <div className="flex gap-3">
    {(['claude', 'openai'] as const).map(p => (
      <label key={p} className="flex items-center gap-2 text-sm">
        <input type="radio" name="provider" checked={provider === p} onChange={() => setProvider(p)} />
        {p}
      </label>
    ))}
  </div>
  <select
    value={model}
    onChange={e => setModel(e.target.value)}
    className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
  >
    {PROVIDER_MODELS[provider].map(m => <option key={m} value={m}>{m}</option>)}
  </select>
</div>
```

Include `orchestratorProvider: provider` and `orchestratorModel: model` in the request body when the team is created.

- [ ] **Step 3: `ControlPanel` — editable fields**

Same pattern for existing teams: show the current provider/model, allow editing, and `PATCH /api/teams/:teamId` with the new values (the backend handler was added in Task 8). On success, rely on the socket `team:updated` event to refresh state.

- [ ] **Step 4: Typecheck**

Run: `cd agent-dashboard/frontend && npx tsc -b --noEmit` and `cd agent-dashboard/backend && npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add agent-dashboard/frontend/src/components/CreateTeamModal.tsx \
        agent-dashboard/frontend/src/components/ControlPanel.tsx
git commit -m "feat(frontend): add provider/model selection UI"
```

---

### Task 21: End-to-end manual smoke

Not a coding task — this is the verification checklist before declaring done.

- [ ] **Backend up:** `cd agent-dashboard/backend && npm run dev`
- [ ] **Frontend up:** `cd agent-dashboard/frontend && npm run dev`
- [ ] Open the dashboard in a browser.
- [ ] Create a new team using the modal. Confirm the provider radio + model dropdown show up. Leave at Claude/Sonnet.
- [ ] Select the team. The Command Center renders a single input + empty thread. No mode selector. No History tab.
- [ ] Type: `what agents do I need for this project?` → expect a plain-text assistant reply streaming in.
- [ ] Type: `analyze the current project structure and suggest three concrete improvements` → expect a `plan_proposal` card with up to 3 items, each with a priority badge.
- [ ] Tick two items, click **Approve selected**. Card locks. Within seconds, `execution_status` rows start appearing inline below the card. `WorkflowTimeline` and `LogsPanel` also update (they still read from the same substrate).
- [ ] Send a new message `make me another plan`. Get another plan proposal. Click **Decline** on this one. Card locks to "Declined"; no execution starts.
- [ ] In `ControlPanel`, switch the team to `openai` + `gpt-4o`. (Skip if no `OPENAI_API_KEY` — the switch is fine, you just shouldn't send a message.)
  - With `OPENAI_API_KEY` unset and provider=openai, sending a message shows a clear error message in the thread (no crash).
  - With a valid key, a message produces a reply through the OpenAI SDK.
- [ ] Reload the browser. Thread history is preserved from `data/state.json`.

If anything above fails, **do not declare done**; fix and re-verify.

---

## Decisions / trade-offs locked in during planning

- **SSE + socket duplication.** The POST `/messages` endpoint streams SSE for the "something is happening right now" indicator only. Canonical state arrives via the socket `chat:message` event (deduped by message id). This keeps multi-client sync automatic.
- **Approved items → single Instruction.** Approved plan items are flattened into one `Instruction` whose `content` is the plan summary + a bullet list of approved item titles/details. `executePlanAndPhases` then re-plans phases via `createPlan` based on the current team. `suggestedAgent` is a UX cue in v1, not a dispatch binding.
- **`chat:questions` deprecation.** The spec describes `chat:questions` as being repurposed to carry mid-execution `plan_proposal` asks. In practice this plan routes every assistant-facing message (clarifications, compositions, proposals, execution status) through `messageStore` + `chat:message`, which subsumes `chat:questions`. The `chat:questions` emission site stays (removing it risks missing a subscriber we haven't located), but the frontend rewrite does not subscribe to it — all state flows via `chat:message`. If a later spec truly needs a discriminated event, it can be revived without breaking the envelope.
- **No per-agent execution_status events in v1.** Phase-boundary start/complete is enough to drive the UI. Per-agent events can be added later by wiring them inside `executePhase` without changing the adapter.
- **Persisted state compatibility:** we do not migrate old `chatHistories` / `instructions` into `messages`. The deploy instructions remove `data/state.json` before first boot of the new code.

---

## After implementation

When all tasks pass and the manual smoke checklist is green:

- Invoke the `superpowers:requesting-code-review` skill for final review before merging.
- Confirm the follow-up spec for **#3 Notion sync** plugs into `onApproved` → `approvedItemIds` without further refactors.
