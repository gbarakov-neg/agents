# Unified Orchestrator Chat — Design

**Date:** 2026-04-22
**Status:** Draft (pending review)
**Scope:** Agent Dashboard — `agent-dashboard/frontend` + `agent-dashboard/backend`

## Problem

The dashboard currently has two surfaces for talking to the orchestrator and
one orphan component:

- `CommandCenter.tsx` has a three-mode selector: `Orchestrate` (plan +
  execute), `Parallel` (fan one instruction to every agent), `Chat` (advisory
  dialogue that *cannot* execute).
- `OrchestratorChat.tsx` is a floating bubble, no longer imported anywhere.
- Backend has two distinct endpoints: `POST /api/teams/:id/instructions` drives
  `executePlanAndPhases`, while `POST /api/teams/:id/chat` is advisory-only
  (its system prompt at `server.ts:1594` literally says "You are advisory —
  you plan and suggest, agents execute"). The chat endpoint's in-memory
  message list is stored per-team on the `Team` object (no dedicated
  top-level `chatState`), while instructions live in the separate
  top-level `instructionsState` array.

The user experience suffers from three mode buttons, two endpoints, and a
chat that structurally *cannot* cause work to happen. The end goal is a
single conversation where typing a goal produces a proposal the user can
approve item-by-item, and approval drives execution.

## Goals

1. Collapse the three-mode CommandCenter into one input + one thread, no
   mode selector.
2. Make the orchestrator's reply self-describing: plain text when discussing,
   a structured plan proposal when suggesting work.
3. Per-item approval on plan proposals; approved items drive execution
   through the existing `executePlanAndPhases` pipeline.
4. Allow the orchestrator turn to be backed by Claude **or** OpenAI, selected
   per team.

## Non-goals (explicit)

- Notion sync for approved items (deferred to follow-up).
- Project creation without a local path (separate spec).
- Chat-first / goal-first app surface that replaces team selection
  (preserves team-centric model).
- Replacing `WorkflowTimeline` / `LogsPanel` / `TeamMonitor` around the
  CommandCenter (they stay; possible consolidation is a later discussion).
- Pagination of `GET /messages` (full thread fetch).
- OpenAI for team composer, `createPlan`, clarifier, report generator, or
  per-agent execution. Only the orchestrator turn is provider-pluggable.
- Per-message provider override. Provider/model is a team-level config.

## Design

### Section 1 — Message envelope schema

Every entry in a team's thread is one of three kinds. This envelope is the
single source of truth shared by backend storage, frontend rendering, and
the orchestrator LLM's structured output format.

```ts
type Message =
  | { id: string; role: 'user' | 'assistant'; kind: 'text';
      content: string; createdAt: string }

  | { id: string; role: 'assistant'; kind: 'plan_proposal';
      summary: string;
      items: Array<{
        id: string;
        title: string;
        detail?: string;
        priority: 'high' | 'medium' | 'low';
        suggestedAgent?: string;
      }>;
      approval: 'pending' | 'approved' | 'declined';
      approvedItemIds?: string[];      // populated when approval='approved'
      createdAt: string }

  | { id: string; role: 'system'; kind: 'execution_status';
      planMessageId: string;           // links back to the plan_proposal
      phase: string;
      agentId?: string;
      status: 'started' | 'progress' | 'completed' | 'failed';
      detail?: string;
      createdAt: string };
```

Notes:

- `plan_proposal.items` are always individually approvable. A card
  containing one item still renders as a one-checkbox list so the shape is
  consistent.
- `execution_status` messages are system-role, rendered inline in the
  thread below their parent `plan_proposal`, and show which agent is doing
  what in real time.
- All three kinds persist to the same `messages[]` array per team,
  replacing today's split between the per-team chat message list and
  the user-facing `instructionsState`. The internal `Instruction` record
  remains as an execution-engine detail.

### Section 2 — Backend: one endpoint, one orchestrator loop

Replace `/chat` and `/instructions` with a single endpoint family:

```
GET  /api/teams/:teamId/messages
POST /api/teams/:teamId/messages
POST /api/teams/:teamId/messages/:msgId/approve
       body: { itemIds: string[] }           // empty array = decline
```

There is no separate `/decline` route. `POST /approve` with `itemIds: []`
is the decline path: server marks the message `approval: 'declined'`,
stores `approvedItemIds: []`, and does not call `executePlanAndPhases`.

The old `POST /api/teams/:id/chat`, `POST /api/teams/:id/instructions`, and
the orphaned `OrchestratorChat.tsx` component are removed. No
backward-compat shims; nothing else in the repo depends on these.

**Orchestrator turn** (handler for `POST /messages`):

1. Append the user's `text` message to the thread.
2. Build the prompt: team context (agents, project info, recent thread
   window) + a system prompt that allows two response shapes. The system
   prompt tells the model: reply with either plain prose (for discussion)
   or a fenced JSON block matching the `plan_proposal` schema (for
   actionable suggestions).
3. Stream the model's response to the client via SSE.
4. After streaming completes, run a stream-then-parse pass on the full
   text:
   - If a valid `plan_proposal` JSON block is present → persist as a
     `plan_proposal` message.
   - Otherwise → persist as a `text` message.
5. Emit the persisted message over the existing `chat:message` socket
   event so other clients stay in sync.

**Approval → execution** (handler for `POST /messages/:msgId/approve`):

1. Load the `plan_proposal` message; validate every `itemId` in the
   request body belongs to the message.
2. If the message is already `approved` or `declined`, respond 409 and
   leave state untouched.
3. Mark `approval: 'approved'`, store `approvedItemIds`.
4. Convert approved items into an internal `Instruction` record
   (preserves the existing execution substrate) and call
   `executePlanAndPhases` unchanged.
5. An adapter wrapping `executePlanAndPhases`'s existing `addLog` and
   phase-transition hooks emits `execution_status` messages into the same
   thread, tagged with `planMessageId` so the frontend can group them
   under the source proposal.

**What stays:** `createPlan`, `executePlanAndPhases`, per-agent dispatch,
log streaming, the `Instruction` type (internal), the `chat:questions`
socket event (repurposed to notify clients of mid-execution
`plan_proposal` asks — payload is the full `Message` envelope for the
new proposal, so the frontend can render it immediately without a
follow-up `GET /messages`).

**Provider abstraction** — the new `/messages` handler does not call Claude
directly. It calls an `OrchestratorProvider`:

```ts
interface OrchestratorProvider {
  streamTurn(args: {
    prompt: string;
    model: string;
    onChunk: (text: string) => void;
    signal: AbortSignal;
  }): Promise<{ fullText: string }>;
}
```

Two implementations:

- `ClaudeCliProvider` — wraps the existing
  `spawn('claude', ['--print', '--model', ...])` pattern. Accepted model
  strings: `opus`, `sonnet`, `haiku`. Default model: `sonnet`.
- `OpenAIProvider` — new dependency on the `openai` npm SDK. Streams via
  the Responses API. Accepted model strings: any string the SDK accepts
  (e.g. `gpt-5`, `gpt-4o`, `o3-mini`). Default model: `gpt-4o`.

The handler is provider-agnostic: prompt construction, stream piping, and
plan-proposal parsing are identical for both providers.

**Team config additions:**

```ts
interface Team {
  // ...existing fields...
  orchestratorProvider: 'claude' | 'openai';  // default 'claude'
  orchestratorModel: string;                   // default per provider
}
```

Defaults for new teams: `claude` + `sonnet`. A `DEFAULT_ORCHESTRATOR_PROVIDER`
env var overrides the default without making selection globally rigid.

**Secrets:** `OPENAI_API_KEY` via env var. No UI-based key entry in this
scope. If a team is configured for `openai` and `OPENAI_API_KEY` is missing,
the `/messages` request fails fast with a `text` error message persisted in
the thread: *"Orchestrator provider is OpenAI but OPENAI_API_KEY is not
set."* No silent fallback.

### Section 3 — Frontend: unified thread

Collapse `CommandCenter.tsx` to a single input + thread. No mode selector,
no tabs.

**Component split:**

- `CommandCenter.tsx` — shell. Fetches `/messages` on mount, wires
  sockets, holds input state, streams replies. Shrinks dramatically once
  modes/tabs/instructions-history are gone.
- `MessageThread.tsx` — new. Renders a `Message[]`, delegating to
  kind-specific sub-components.
- `PlanProposalCard.tsx` — new. Renders an assistant-side card with
  per-item checkboxes, color-coded priority text badges
  (`HIGH`/`MED`/`LOW`), approve/decline buttons. On approve, posts
  selected `itemIds` to `/approve` and locks the card to its resolved
  state with checkmarks on approved items.
- `ExecutionStatusRow.tsx` — new. Dim single-line system row. Each agent
  gets a deterministic color derived from its id/name (stable across
  rows) and a small icon: a pulsing dot while `status='progress'`, a
  check/cross on `completed`/`failed`. When >5 rows share a
  `planMessageId`, they collapse under an "Execution" disclosure.
- `OrchestratorChat.tsx` — deleted.

**Input behavior:**

- Enter sends, Shift+Enter inserts a newline. No mode-dependent key
  handling.
- Disabled while streaming.
- Error recovery: if the stream fails mid-reply, the last assistant
  message shows an inline error with a retry button.

**State flow:**

1. Mount → `GET /messages` → seeds thread.
2. Send → optimistically append the user's message → `POST /messages` →
   stream chunks mutate the last assistant message.
3. Socket `chat:message` → append or reconcile any server-pushed message
   (plan_proposals, execution_status, mid-execution asks).
4. Approve in `PlanProposalCard` → `POST /approve` with `itemIds` → card
   updates to `approved`. On failure: toast and keep card in `pending`.
5. Out-of-order socket arrivals: `execution_status` for an unknown
   `planMessageId` renders as a standalone system row rather than being
   dropped.

**Provider visibility in UI:**

- `CreateTeamModal` — adds a provider radio (`Claude` / `OpenAI`) and a
  model dropdown whose options change with the selected provider.
- `ControlPanel` — adds the same two fields for existing teams, editable
  inline.
- Command Center header — small badge `{teamName} · gpt-4o` so the user
  can see at a glance which model is driving the thread.

### Section 4 — Error handling & edge cases

- **Malformed plan_proposal JSON from the model** — stream-then-parse
  failure falls back to persisting as `text`. Server-side warning log.
  No retry.
- **User approves a plan that is already approved or declined** —
  409 from `/approve`; UI surfaces "already resolved".
- **User declines** — card locks to `approval: 'declined'`; no execution.
  User sends a new message to iterate.
- **Approve zero items** — treated as decline; card locks; no execution.
- **Team deleted mid-stream** — SSE closes cleanly.
  `executePlanAndPhases` already tolerates team absence.
- **Server restart mid-execution** — today's behavior stays (executing
  Instructions reset to pending per `server.ts:218`). New
  `plan_proposal` messages persist fine; their approval state survives
  restart.
- **Empty or duplicate item ids in a plan_proposal** — persisted as text
  (same fallback path as malformed JSON).
- **Missing `OPENAI_API_KEY` when provider=openai** — immediate error
  `text` message in thread (see Section 2).
- **OpenAI API 429 / 5xx** — error `text` message with the error's user-
  safe summary; retry button surfaces on the user's last turn.
- **Invalid model string for the selected provider** — same pattern;
  surfaces as a thread error message.

### Section 5 — Testing

**Backend unit:**

- Plan-proposal parser: valid JSON, malformed JSON, missing required
  fields, duplicate item ids, empty items.
- Approve handler: happy path, unknown `msgId`, unknown `itemIds`,
  double-approve, zero items.
- Thread persistence: all three message kinds round-trip through
  `GET /messages`.
- Provider implementations: each mocked; both produce the same
  observable `{fullText, chunks}` shape.

**Backend integration:**

- End-to-end (Claude): user sends message → model returns
  `plan_proposal` → stored → approve 2 of 3 items →
  `executePlanAndPhases` invoked with exactly those two →
  `execution_status` messages appear in the thread with correct
  `planMessageId`.
- End-to-end (text): user sends question → model returns prose → stored
  as `text`, no plan created.
- End-to-end (OpenAI): team configured with
  `orchestratorProvider: 'openai'` → send message → OpenAI SDK called
  with the team's configured model → parser handles `plan_proposal`
  identically. OpenAI mocked; no real API calls.

**Frontend component:**

- `PlanProposalCard` — checkbox state, approve posts only selected ids,
  card disabled after approval, decline path.
- `MessageThread` — renders all three kinds, groups `execution_status`
  under the correct plan, tolerates out-of-order socket arrivals.

**Manual smoke (acceptance):**

- "what agents do I need?" → plain text reply, no plan card.
- "analyze github.com/X and suggest improvements" → plan_proposal with
  per-item checkboxes → approve two → agents start; inline status rows
  appear; `WorkflowTimeline` / `LogsPanel` also reflect the work
  (they share the substrate).

**Not covered:** internals of `createPlan` / `executePlanAndPhases`
(unchanged); Notion path (out of scope).

## Migration

No data migration required for a fresh or development-only deployment.
The existing `chatState` and `instructionsState` structures in
`server.ts` are replaced by a unified per-team `messages[]`. If a running
deployment has in-memory state, it is discarded on restart (current
behavior for executing instructions already resets state at restart, so
this is consistent).

Deletions in one commit:

- `agent-dashboard/frontend/src/components/OrchestratorChat.tsx`
- `POST /api/teams/:id/chat`, `POST /api/teams/:id/instructions` handlers
- The `mode` state machine and mode selector in `CommandCenter.tsx`
- The "History" tab in `CommandCenter.tsx`
- The advisory-only chat system prompt at `server.ts:1594`

## Open questions

None as of this draft. All prior design branches were resolved with the
user during brainstorming.

## Follow-ups (explicitly deferred)

- **#3 — Notion sync.** The `approvedItemIds` field plus the approve
  handler give a clean hook for pushing approved items into a Notion
  database in the next spec.
- **#1 — Project without local path.** Separate spec.
- **Chat-first app surface.** Separate decision; today's team-centric
  model is preserved.
- **Per-message provider override.** Can be added later without changing
  the provider-abstraction shape.
- **Azure OpenAI, Anthropic SDK (non-CLI), local models.** Fit the same
  `OrchestratorProvider` interface; add when needed.
