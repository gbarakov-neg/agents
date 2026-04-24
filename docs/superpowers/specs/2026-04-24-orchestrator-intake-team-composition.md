# Orchestrator-Driven Intake & Team Composition (+ Notion per-project) — Design

**Date:** 2026-04-24
**Status:** Draft (pending review)
**Scope:** Agent Dashboard — `agent-dashboard/backend` (primarily) + small frontend tweaks
**Follows:** `2026-04-22-unified-orchestrator-chat-design.md` (merged on `feat/unified-orchestrator-chat`)

## Problem

After the unified-chat refactor, a new project gets an auto-created empty team (see `bbbce9e`) but the user has to either populate it via the `AddAgentModal` (manual picking from a 79-plugin catalog) or send a work-goal message that the orchestrator can't properly act on because there are no agents to dispatch. The orchestrator has no mechanism today to ask clarifying questions, suggest agents, or help the user compose the team.

Separately, Notion integration exists for per-instruction task tickets (`createTaskTicket`, `appendAgentReport`, `updateTicketStatus`) but there is no per-project page — project context, the intake brief, and the team composition are not persisted to Notion, and task tickets are orphan at the database root rather than grouped under their project.

## Goals

1. When the active team has **zero agents**, the orchestrator's first response enters **intake mode**: asks 1–3 concise clarifying questions about what the user is building, constraints, tech stack.
2. After enough context is captured, the orchestrator emits a `plan_proposal` whose items are **agent additions** (not work items). Approving selected items hydrates the team.
3. After the team is composed, the orchestrator behaves normally — subsequent `plan_proposal` messages are work items and drive execution.
4. When Notion is configured (`NOTION_TOKEN` + `NOTION_DATABASE_ID`), every project gets a **project page** in Notion. The intake brief, the composed team, and all approved work plans are appended to that page. Task tickets for work plans link back to the project page.

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

### Section 2 — Intake mode (orchestrator behavior)

**Trigger:** When the POST `/messages` handler calls the provider, the prompt builder inspects `team.agents`. If `agents.length === 0`, the prompt switches to **intake mode**.

**Intake-mode prompt additions** (appended to the existing orchestrator system prompt):

> The team has no agents yet. Your job for the next few turns is to understand the project before proposing a team.
>
> - Ask 1–3 focused questions across turns to establish: what is being built, the target users, the tech stack or platform, and the most important constraints (deadlines, integrations, existing code to integrate with). Keep each turn short — one question per turn is fine.
> - When you have enough context, emit a `plan_proposal` whose items recommend agents to add. Each item MUST have `"kind": "add_agent"` and `"title"` must be a valid agent role from the catalog below. Use `"detail"` to explain why this agent fits.
> - Do NOT emit a `plan_proposal` with `kind: "work"` while the team is empty — work items require agents to dispatch.
>
> Agent catalog (use exact role strings):
> {name}: {short description, truncated to 80 chars}
> … (catalog of `availableAgents`, sorted alphabetically)

The agent catalog is injected as a bulleted list, capped at ~80 entries (the full plugin marketplace). For deployments with larger catalogs, the list is truncated and the prompt notes the truncation; future work: top-k relevance selection based on intake text.

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
2. For each valid role, construct an `Agent` record mirroring the shape `CreateTeamModal`/`AddAgentModal` produce today — unique id, display name derived from the role, `status: 'idle'`, `progress: 0`, `plugin` from the catalog entry, `model` from the catalog entry's preferred model or the team's default.
3. Push them into `team.agents`, emit `team:updated`.
4. Append an `execution_status` message tagged with the planMessageId: `{ phase: 'team', status: 'completed', detail: 'Added N agent(s): role-a, role-b' }` so the thread shows the effect inline.
5. If Notion is enabled and the team has a `notionPageId` (see Section 5), append a "Team composition" block listing the agents and rationale.

No Claude subprocess is spawned. Adding agents is pure state mutation.

### Section 4 — Prompt builder: catalog injection

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

- If `team.agents.length === 0` and `availableAgents` is provided with ≥1 entry → emit intake-mode prompt with the catalog appended (capped at ~80 entries).
- Else → emit the existing "normal mode" prompt.

Router passes `availableAgents` from the server's in-memory catalog so the prompt builder doesn't need to know about `scanAgents()`.

### Section 5 — Notion: per-project page

Expand `notion.ts` with one new function and adjust the existing flow.

**New:** `createProjectPage({ name, path, description?, url? })` → returns `{ pageId: string } | null`. Creates a Notion database page titled with the project name. If the database has a `Type` select property, set it to `Project`. If not, prefix the title with `[Project] `. Stores a page id.

**Mutations to existing `server.ts` Notion wiring:**

1. **On project create** (`POST /api/projects`): if Notion enabled, call `createProjectPage`, save `projectsState.get(id).notionPageId = pageId` (new optional field on `Project`).
2. **On intake user message captured** (any `text` user message sent while team has `agents.length === 0`): append the message to the project page under a "Brief" block. Best-effort; a failure logs and moves on.
3. **On `add_agent` plan approved** (inside `dispatchAgentAdds`): append a "Team composition" block listing the added agent roles + rationale.
4. **On `work` plan approved** (inside `dispatchApprovedPlan`): the existing `createTaskTicket` call gains an optional `parentPageId` argument. If the project has a `notionPageId`, pass it so the task ticket becomes a child of the project page (Notion API supports `parent: { page_id: ... }` for creating sub-pages, OR a `Project` relation property if the DB has one — prefer relation; fall back to title link).
5. **On execution complete**: unchanged — existing `updateTicketStatus` and `appendAgentReport` keep working.

**Environment variables**: unchanged — `NOTION_TOKEN` + `NOTION_DATABASE_ID` gate all writes via the existing `isNotionEnabled()`. No new env vars.

**Project/Team types:** `Project` gains optional `notionPageId?: string`. `Team` already has no notion fields (per-instruction ticket tracking lives on `Instruction`).

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
- **Catalog truncation** → the prompt notes "(… and N more agents; ask the user what domain they need and I'll suggest the right role)".

### Section 8 — Testing

**Backend unit:**

- Parser: accept `kind: 'add_agent'`, reject mixed-kind item arrays, preserve existing behavior for kindless items (default 'work').
- Prompt builder: intake mode fires at `agents.length === 0` + catalog present; normal mode otherwise; catalog truncation marker present at >80 entries.
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

No data migration. Additive: new optional fields (`PlanProposalItem.kind`, `Project.notionPageId`) are ignored when absent. Existing `plan_proposal` records persist fine.

## Open questions

1. **Agent-catalog truncation threshold.** 80 feels arbitrary but the full catalog (~180 roles) would bloat every turn's prompt. Options: (a) static cap, (b) simple substring filter based on the user's first message, (c) embedding-based top-k. Recommend (a) for v1; revisit if the orchestrator starts hallucinating roles.

2. **Add-agent approvals and model selection.** Each agent catalog entry has a preferred `model` (sonnet/haiku/opus). `dispatchAgentAdds` uses the catalog default. Should the user be able to override model at approve time? Nice-to-have; skip in v1.

3. **Re-entering intake mode.** If the user deletes all agents from an existing team, should the orchestrator re-enter intake? Current design: yes — it's based on live state, not a one-shot flag. Low cost, safe default.

## Follow-ups (explicitly deferred)

- **Top-k catalog relevance** via keywords or embeddings — v2 when catalogs exceed ~200 entries.
- **"Team proposal" visual distinction** on `PlanProposalCard` — label + icon.
- **Two-way Notion sync** — pull edits from the project page back into the dashboard.
- **Per-project Notion database** rather than tagging within one DB.
