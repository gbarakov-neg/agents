import type { PlanProposalItem, Priority } from './types';

export interface PlanProposalPayload {
  summary: string;
  items: PlanProposalItem[];
}

const VALID_PRIORITIES: ReadonlySet<Priority> = new Set(['high', 'medium', 'low']);
const VALID_KINDS: ReadonlySet<string> = new Set(['work', 'add_agent']);

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
  return { summary: o.summary, items };
}
