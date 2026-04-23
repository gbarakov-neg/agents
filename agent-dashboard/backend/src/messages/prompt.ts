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
