import type { Message } from './types';
import { filterCatalog, extractKeywords, type CatalogEntry } from './catalogFilter';

export interface PromptTeam {
  id: string; name: string;
  agents: Array<{ id: string; role: string; status: string; progress: number; name: string; model: string }>;
}

export interface PromptProject {
  id: string; name: string; path: string;
  description?: string;
}

export type PromptAgentEntry = CatalogEntry;

export function buildOrchestratorPrompt(args: {
  team: PromptTeam;
  project: PromptProject;
  thread: Message[];
  availableAgents?: PromptAgentEntry[];
}): string {
  const { team, project, thread } = args;
  const agentList = team.agents.length
    ? team.agents.map(a => `- ${a.name} (role: ${a.role}, status: ${a.status})`).join('\n')
    : '(no agents on team)';

  const textThread = thread.filter((m): m is Extract<Message, { kind: 'text' }> => m.kind === 'text');

  const intakeMode = team.agents.length === 0 && !!args.availableAgents && args.availableAgents.length > 0;

  if (intakeMode) {
    const userText = textThread
      .filter(m => m.role === 'user')
      .map(m => m.content);
    const keywords = extractKeywords([
      ...userText,
      project.name,
      ...(project.description ? [project.description] : []),
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
