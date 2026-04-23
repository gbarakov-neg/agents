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
    const { teamId } = req.params as { teamId: string };
    res.json({ messages: deps.store.get(teamId) });
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
