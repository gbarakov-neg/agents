# Orchestrator-Driven Intake & Team Composition (+ Notion per-project) — Design

**Date:** 2026-04-24
**Status:** Draft (pending review)
**Scope:** Agent Dashboard — `agent-dashboard/backend` (primarily) + small frontend tweaks
**Follows:** `2026-04-22-unified-orchestrator-chat-design.md` (merged on `feat/unified-orchestrator-chat`)

## Problem

After the unified-chat refactor, a new project gets an auto-created empty team (see `bbbce9e`) but the user has to either populate it via the `AddAgentModal` (manual picking from a 79-plugin catalog) or send a work-goal message that the orchestrator can't properly act on because there are no agents to dispatch. The orchestrator has no mechanism today to ask clarifying questions, suggest agents, or help the user compose the team.

Separately, Notion integration exists for per-instruction task tickets (`createTaskTicket`, `appendAgentReport`, `updateTicketStatus`) but there is no per-project page — project context, the intake brief, and the team composition are not persisted to Notion, and task tickets are orphan at the database root rather than grouped under their project.

## Goals

1. When the active team has **zero agents**, the orchestrator's first response enters **intake mode**: asks *as many clarifying questions as it needs* (no hard cap) about what the user is building, constraints, tech stack. The orchestrator decides when it has enough context.
2. After enough context is captured, the orchestrator emits a `plan_proposal` whose items are **agent additions** (not work items). Approving selected items hydrates the team.
3. After the team is composed, the orchestrator behaves normally — subsequent `plan_proposal` messages are work items and drive execution.
4. **Project documentation is always written somewhere.** If Notion is configured, write to a per-project Notion page (brief, team composition, approved tasks, reports). If Notion is not configured, fall back to a **local markdown file** under the dashboard's data directory. Every project has a canonical document location.

## Non-goals (explicit)

- A separate "Project" database in Notion — we keep one database and distinguish records by a type property (or by Title prefix if the DB schema doesn't support properties). Schema complexity is deferred.
- Removing or deprecating the `AddAgentModal` — the manual path stays. The intake flow is an *additional* way to populate a team, not a replacement.
- Changing agent execution, `createPlan`, or per-agent dispatch.
- Per-agent provider/model (out-of-scope design decision from the previous spec; still team-level).
- Multi-team intake (intake mode only fires on the team attached to a project when that team is empty).
- Live Notion two-way sync (edits in Notion flowing back to the dashboard) — writes only, like today.

## Design

### Section 1 — Message envelope: add `kind` to plan items

`PlanProposalItem` gains an optional discriminant:

```ts
export type PlanItemKind = 'work' | 'add_agent';

export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
  kind?: PlanItemKind;   // default 'work' when absent (back-compat)
}
```

**Homogeneity rule.** All items within a single `plan_proposal` must share the same `kind`. The server rejects mixed proposals at persist time (falls back to `text`, same path as other malformed payloads). This keeps the approve handler simple — no merging of dispatches.

**Field semantics for `kind: 'add_agent'` items:**
- `title` is authoritative — it MUST be an exact role name from the agent catalog. The dispatcher matches on `title` only.
- `suggestedAgent` is ignored for `add_agent` items. The parser does not require it to be set; if it is set, it's kept in storage for display purposes but never consulted for dispatch. (Rationale: keeps the matching rule one-field-only, no fallback ambiguity.)
- `detail` is free-form rationale shown to the user.

### Section 2 — Intake mode (orchestrator behavior)

**Trigger:** When the POST `/messages` handler calls the provider, the prompt builder inspects `team.agents`. If `agents.length === 0`, the prompt switches to **intake mode**.

**Intake-mode prompt additions** (appended to the existing orchestrator system prompt):

> The team has no agents yet. Your job is to understand the project before proposing a team.
>
> - Ask **as many focused questions as you need** to establish: what is being built, the target users, the tech stack or platform, and the most important constraints (deadlines, integrations, existing code to integrate with). One question per turn is ideal. There is no hard limit — don't rush to a team proposal before you're confident.
> - When, and only when, you have enough context, emit a `plan_proposal` whose items recommend agents to add. Each item MUST have `"kind": "add_agent"` and `"title"` must be a valid agent role from the catalog below. Use `"detail"` to explain why this agent fits.
> - Do NOT emit a `plan_proposal` with `kind: "work"` while the team is empty — work items require agents to dispatch.
>
> Agent catalog (use exact role strings — these are the roles that look most relevant to what the user has described so far):
> {name}: {short description, truncated to 80 chars}
> … (filtered, relevance-ranked list — see Section 4)

Catalog injection is **relevance-filtered**, not a static cap — see Section 4 for the ranking.

**Normal mode prompt** (when `agents.length > 0`) is unchanged from the previous spec — the orchestrator proposes work or discusses.

### Section 3 — Approve handler: branch on item kind

The `POST /messages/:msgId/approve` handler already loads the `plan_proposal` and its `approvedItemIds`. The router delegates to one of two dispatchers based on the items' shared `kind`:

```ts
onApproved(teamId, planMessageId, itemIds)
  → determine kind from first approved item in store
  → if 'add_agent': dispatchAgentAdds(teamId, planMessageId, itemIds)
  → if 'work'     : dispatchApprovedPlan(teamId, planMessageId, itemIds)   // existing
```

`dispatchAgentAdds` (new helper in `server.ts`):

1. Look up each approved item's `title` against `availableAgents` (the plugin catalog). Skip items whose title is not a known role; emit a warning `execution_status` message.
2. For each valid role, construct an `Agent` record mirroring the shape `CreateTeamModal`/`AddAgentModal` produce today — unique id, display name derived from the role, `status: 'idle'`, `progress: 0`, `plugin` from the catalog entry, `model` resolved as: the catalog entry's `model` field if set, else the team's `orchestratorModel`, else a hard-coded fallback (`sonnet`).
3. Push them into `team.agents`, emit `team:updated`.
4. Append an `execution_status` message tagged with the planMessageId: `{ phase: 'team', status: 'completed', detail: 'Added N agent(s): role-a, role-b' }` so the thread shows the effect inline.
5. If Notion is enabled and the team has a `notionPageId` (see Section 5), append a "Team composition" block listing the agents and rationale.

No Claude subprocess is spawned. Adding agents is pure state mutation.

### Section 4 — Prompt builder: relevance-filtered catalog injection

`buildOrchestratorPrompt` gains an optional `availableAgents` parameter:

```ts
export interface PromptAgentEntry {
  name: string;
  description: string;
}

buildOrchestratorPrompt(args: {
  team: PromptTeam;
  project: PromptProject;
  thread: Message[];
  availableAgents?: PromptAgentEntry[];
}): string
```

Behavior:

- If `team.agents.length === 0` and `availableAgents` is provided with ≥1 entry → emit intake-mode prompt with a **relevance-filtered subset** of the catalog appended.
- Else → emit the existing "normal mode" prompt.

**Relevance filter** (pure function, no extra API calls):

1. **Extract keywords from the thread.** Concatenate the `content` of every `user`/`text` message + the project `name` + `description`. Lowercase. Drop stop words (common English filler — a short hard-coded list like `the, a, an, for, to, with, of, and, i, we, our, my, this, that, want, need, build, make`). Keep tokens of length ≥ 3.
2. **Score each catalog entry.** For each entry in `availableAgents`, lowercase `name + description` and count how many distinct keywords match as substrings. Bonus of +2 if a keyword appears in `name` (name matches are stronger signal than description matches).
3. **Always-include core.** A small hard-coded set of general-purpose roles always make the cut: `product-owner`, `backend-architect`, `frontend-developer`, `code-reviewer`, `security-auditor`, `test-automator`. These show up regardless of score so niche queries don't starve.
4. **Result composition.** Take the top 30 entries by score (descending), union with the always-include core (deduplicated), sort alphabetically for stable output. If the resulting set is still < 40 entries, backfill with the highest-remaining-score entries up to 40.
5. **Fallback when nothing matches.** If scoring yields zero keyword matches across the entire catalog (e.g., the user has only said "hi"), emit only the always-include core + a note: *"I have more agents in my catalog — tell me more about the project and I'll suggest specific ones."*

Router passes the full `availableAgents` array; the builder does the filtering. Filter logic lives in the prompt builder (same module) and gets its own unit tests.

Caps:
- Hard ceiling at 40 entries in the prompt to keep token cost bounded.
- If the filtered set hits the ceiling and many more matched, the prompt notes "(N more agents available — narrow your ask if you need a different specialty)".

### Section 5 — Project documentation: Notion or local-markdown fallback

Every project gets a canonical documentation surface. The location depends on whether Notion is configured — the dashboard writes to **one or the other**, never both.

#### 5a. Unified `ProjectDoc` interface

A small new module `agent-dashboard/backend/src/docs/projectDoc.ts` exposes:

```ts
export interface ProjectDocSink {
  createProject(input: { projectId: string; name: string; path: string; url?: string; description?: string }): Promise<void>;
  appendBrief(projectId: string, userMessage: string): Promise<void>;          // intake turn
  appendTeamComposition(projectId: string, entries: { role: string; rationale: string }[]): Promise<void>;
  appendTask(projectId: string, input: { title: string; items: string[]; agents: string[] }): Promise<{ ticketRef?: string }>;
  updateTaskStatus(projectId: string, ticketRef: string, status: 'Done' | 'Failed'): Promise<void>;
  appendAgentReport(projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
```

Two implementations:

- **`NotionProjectDoc`** — wraps `notion.ts`. `createProject` calls a **new function** `createProjectPage({ name, path, description?, url? })` that must be added to `notion.ts`; existing `createTaskTicket`, `updateTicketStatus`, `appendAgentReport` are reused. `createProjectPage` creates a database page and returns the `pageId`. The sink keeps an in-process map `projectId → pageId`. All other sink methods look up the `pageId` and either append blocks or create child pages (`appendTask` calls `createTaskTicket` with `parent: { page_id: <pageId> }`). `updateTaskStatus` → existing `updateTicketStatus`. `appendAgentReport` → existing `appendAgentReport`.
- **`LocalMarkdownProjectDoc`** — writes markdown under `<DATA_DIR>/projects/<projectId>/` (DATA_DIR is the existing `agent-dashboard/backend/data/`). Layout:
  ```
  data/projects/<projectId>/
    project.md          ← front matter (name, path, url, description) + intake brief + team composition
    tasks/
      <timestamp>-<slug>.md   ← one file per approved work plan; status header + reports appended
  ```
  `ticketRef` for local is the relative file path (e.g. `tasks/20260424T094212-landing-page.md`). Writes are append-only and atomic (`fs.appendFile`).

A **factory** `resolveProjectDoc()` picks the sink at call time based on `isNotionEnabled()`. No global state; easy to swap if the user enables Notion later — existing local docs aren't migrated, but new writes go to Notion. (Migration is a follow-up.)

#### 5b. Call sites in `server.ts`

1. **On project create** (`POST /api/projects`): call `projectDoc.createProject(...)` after the in-memory project is registered.
2. **On intake user message**: inside the `/messages` POST handler, after appending the user message, if `team.agents.length === 0` call `projectDoc.appendBrief(team.projectId, content)`. (Guard on `team.projectId` existing.)
3. **On `add_agent` plan approved** (`dispatchAgentAdds`): call `projectDoc.appendTeamComposition(projectId, entries)`.
4. **On `work` plan approved** (`dispatchApprovedPlan`): replace the existing direct `createTaskTicket` call with `projectDoc.appendTask(projectId, { title, items, agents })`. Store the returned `ticketRef` on the `Instruction` — the existing `Instruction.notionPageId` field is renamed to `docTicketRef`.
5. **On phase complete / agent report / execution finish**: the existing `appendAgentReport` / `updateTicketStatus` calls route through the sink. If the Instruction has no `docTicketRef` (e.g. sink write failed earlier), `appendAgentReport` / `updateTaskStatus` are silent no-ops — matching the current behavior when `notionPageId` is null.

#### 5c. Failure behavior

- Notion call fails → log a warning (`console.warn('[notion] ...')`), do NOT fall back to local (the user expected Notion; silent divergence is worse than a missing entry). Dashboard continues to function.
- Local write fails (disk full, permission) → log a warning. Same rule.
- Disk usage is bounded only by the user's project count × task count. No automatic pruning in v1.

**Project type:** `Project` gains `docRef?: string` (Notion `pageId`, or the local `data/projects/<id>/` path for symmetry). `Instruction.notionPageId` is renamed to `docTicketRef`.

**Persisted-state migration (small, explicit):** `loadState` in `server.ts` reads each instruction and, if the legacy `notionPageId` field is present and `docTicketRef` is absent, copies it over: `instr.docTicketRef = instr.notionPageId; delete instr.notionPageId`. This is a one-shot rewrite done at load time; no separate migration step. Same pattern is used for `Project.docRef` if any prior field existed (none did in v1, so this is strictly a forward-compat placeholder).

**Environment variables:** unchanged — `NOTION_TOKEN` + `NOTION_DATABASE_ID` still gate Notion. When they're both absent, the factory returns `LocalMarkdownProjectDoc` instead of a no-op.

### Section 6 — UI: minor adjustment

The frontend needs **no new components**. One small behavioral tweak in `CommandCenter`:

- When the active team has `agents.length === 0` and the thread is empty, render an updated empty-state hint: *"New team — tell the orchestrator what you're building and it'll help you pick agents."* instead of the current generic copy. 5-line change.

`PlanProposalCard` already renders any item shape; `kind: 'add_agent'` items render identically (priority badge + title + detail + suggestedAgent). A subtle label on the card ("Team proposal" vs. default "Proposal") would help — nice-to-have, deferred.

### Section 7 — Error handling & edge cases

- **Mixed-kind plan_proposal** → parser rejects, falls back to `text`. Orchestrator sees the invalid format in its own response and won't mis-route.
- **`add_agent` item whose title isn't a real role** → dispatcher skips it, emits a warning `execution_status` row. User sees which items were rejected.
- **User approves an `add_agent` plan when the team already has agents** → handler is idempotent: if an agent with the same `role` already exists, skip and warn. No duplicates.
- **Team pre-loaded with agents** (e.g. via `CreateTeamModal` before first chat) → intake mode never fires. Orchestrator is in normal mode from turn one.
- **Notion disabled mid-session** → any notion call early-returns; no error messages in the thread.
- **Notion `createProjectPage` fails** → logged; project creation still succeeds; downstream writes that reference the missing `notionPageId` early-return.
- **Catalog truncation** → the prompt notes "(N more agents available — narrow your ask if you need a different specialty)". Applies when the relevance filter produces more than the 40-entry hard ceiling.
- **Local docs** → if a project's local docs directory is deleted externally (e.g. user rm's `data/projects/<id>/`), the next write silently re-creates it; no attempt to detect external deletion.
- **Project deletion** → `DELETE /api/projects/:id` already unlinks teams. Extend to also call `projectDoc.deleteProject(id)` which deletes the local directory or archives the Notion page (Notion archive, not hard delete).

### Section 8 — Testing

**Backend unit:**

- Parser: accept `kind: 'add_agent'`, reject mixed-kind item arrays, preserve existing behavior for kindless items (default 'work').
- Prompt builder: intake mode fires at `agents.length === 0` + catalog present; normal mode otherwise; relevance filter returns ≤ 40 entries; truncation marker present when pre-filter matches exceed 40; always-include core always present; fallback-only message when no keyword matches.
- `dispatchAgentAdds`: adds listed agents, skips unknown roles with a warning, is idempotent on re-add.

**Backend integration:**

- End-to-end: empty team → send "build me a landing page" → stub provider returns an `add_agent` plan → approve 2 items → verify `team.agents` gains both, `team:updated` emitted, `execution_status` row appended.
- End-to-end with Notion mocked: project creation triggers `createProjectPage`; approved team composition appends a block; approved work plan creates a task ticket with the project parent reference.

**Frontend:** no new component tests; existing `PlanProposalCard` tests continue to pass since the card is agnostic to item kind.

**Manual smoke:**

- Create a new project with Notion enabled. Verify a page appears in the configured database.
- Select the auto-created team, send "we're building a Next.js landing page for a perfume brand". Confirm the orchestrator asks a follow-up question rather than proposing work.
- Answer; after 1–2 turns, confirm a `plan_proposal` lists concrete agents (e.g. `frontend-developer`, `ui-visual-validator`, `product-owner`).
- Approve 2. Sidebar team card shows agents with their role colors; thread shows an execution_status row.
- Send a work goal; confirm the orchestrator now emits a `work` plan; approving kicks `executePlanAndPhases` and the Notion task ticket is created under the project page.

## Migration

Additive schema changes:
- `PlanProposalItem.kind` — optional; kindless items default to `work` at the parser level.
- `Project.docRef` — optional; new field, absent on persisted state from prior runs (no-op).
- `Instruction.docTicketRef` — renames `Instruction.notionPageId`. One-shot copy at `loadState` time (see Section 5c): if `notionPageId` is present on a loaded record and `docTicketRef` is absent, it's copied to `docTicketRef` and the old key is removed. Persisted state with only the new name is left as-is. No standalone migration script.

Existing `plan_proposal` messages persist fine. No breaking changes to the wire format — the message envelope is identical byte-for-byte when `kind` isn't emitted.

## Open questions

None at this draft — all prior questions resolved during brainstorming:

- **Intake turn cap**: none. Orchestrator decides when it has enough context.
- **Catalog filter**: keyword-score + always-include core + 40-entry hard ceiling (Section 4).
- **Per-agent model override at approve time**: out of scope for v1; dispatcher uses catalog default.
- **Re-intake on emptied team**: allowed — it fires any time `team.agents.length === 0`. When a project is deleted, the team is deleted or unlinked by the existing cascade, so no orphan re-intake.

## Follow-ups (explicitly deferred)

- **"Team proposal" visual distinction** on `PlanProposalCard` — label + icon to distinguish `kind: 'add_agent'` visually.
- **Embedding-based catalog relevance** — v2 if the keyword filter starts missing obviously-relevant agents.
- **Two-way Notion sync** — pull edits from the project page back into the dashboard.
- **Local → Notion migration** — when a user enables Notion after accumulating local docs, offer a one-shot migration that uploads existing local markdown as Notion pages.
- **Local doc pruning / archival** — not in v1; disk grows unbounded with approved tasks.
- **Dedicated Notion database per project** — simpler UX but requires `createDatabase` permission.
