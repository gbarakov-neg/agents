const {
  createProjectPageMock, createTaskTicketMock, updateTicketStatusMock, appendAgentReportMock,
  appendProjectBlocksMock, archiveProjectPageMock,
} = vi.hoisted(() => ({
  createProjectPageMock: vi.fn(),
  createTaskTicketMock: vi.fn(),
  updateTicketStatusMock: vi.fn(),
  appendAgentReportMock: vi.fn(),
  appendProjectBlocksMock: vi.fn(),
  archiveProjectPageMock: vi.fn(),
}));

vi.mock('../../../notion.js', () => ({
  createProjectPage: createProjectPageMock,
  createTaskTicket: createTaskTicketMock,
  updateTicketStatus: updateTicketStatusMock,
  appendAgentReport: appendAgentReportMock,
  appendProjectBlocks: appendProjectBlocksMock,
  archiveProjectPage: archiveProjectPageMock,
  checkAgentTodo: vi.fn(),
  isNotionEnabled: () => true,
  initNotion: vi.fn(),
}));

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MessageStore } from '../store';
import { createExecutionAdapter } from '../executionAdapter';
import { createMessagesRouter } from '../router';
import type { OrchestratorProvider } from '../../providers/types';
import { resolveProjectDoc } from '../../docs/factory';

interface TestAgent { id: string; role: string; name: string; status: string; progress: number; model: string }
interface TestTeam { id: string; name: string; projectId?: string; agents: TestAgent[]; orchestratorProvider: 'claude' | 'openai'; orchestratorModel: string }

interface BuildAppCtx {
  store: MessageStore;
  adapter: ReturnType<typeof createExecutionAdapter>;
}

function buildApp(opts: {
  team: TestTeam;
  availableAgents: { name: string; description: string }[];
  providerReply: string;
  emitSpy?: (event: string, payload: unknown) => void;
  onApprovedFactory?: (ctx: BuildAppCtx) => (teamId: string, planMessageId: string, itemIds: string[]) => void;
}) {
  const app = express();
  app.use(express.json());
  const store = new MessageStore();
  const emits: Array<{ event: string; payload: unknown }> = [];
  const adapter = createExecutionAdapter({
    store,
    emit: (event, payload) => {
      emits.push({ event, payload });
      opts.emitSpy?.(event, payload);
    },
  });
  const provider: OrchestratorProvider = {
    async streamTurn({ onChunk }) { onChunk(opts.providerReply); return { fullText: opts.providerReply }; },
  };
  const onApproved = opts.onApprovedFactory
    ? opts.onApprovedFactory({ store, adapter })
    : () => {};
  app.use('/api/teams/:teamId/messages', createMessagesRouter({
    store,
    getTeam: () => opts.team,
    getProject: () => ({ id: 'p1', name: 'Smoke', path: '/tmp' }),
    getAvailableAgents: () => opts.availableAgents,
    getProvider: () => provider,
    onApproved,
    emit: (event, payload) => {
      emits.push({ event, payload });
      opts.emitSpy?.(event, payload);
    },
  }));
  return { app, store, adapter, emits };
}

describe('intake → add_agent approval flow', () => {
  it('adds approved agents, emits team:updated, and appends execution_status', async () => {
    const team: TestTeam = {
      id: 't1', name: 'Alpha', projectId: 'p1', agents: [],
      orchestratorProvider: 'claude', orchestratorModel: 'sonnet',
    };
    const availableAgents = [
      { name: 'frontend-developer', description: 'UI' },
      { name: 'backend-architect', description: 'API' },
    ];
    const plan = {
      kind: 'plan_proposal', summary: 'team',
      items: [
        { id: 'a', title: 'frontend-developer', priority: 'high', kind: 'add_agent', detail: 'UI work' },
        { id: 'b', title: 'backend-architect', priority: 'high', kind: 'add_agent', detail: 'API work' },
      ],
    };

    const approveSpy = vi.fn();
    const { app, store, emits } = buildApp({
      team, availableAgents,
      providerReply: '```json\n' + JSON.stringify(plan) + '\n```',
      onApprovedFactory: ({ store: ctxStore, adapter: ctxAdapter }) => (teamId, planMessageId, itemIds) => {
        approveSpy(teamId, planMessageId, itemIds);
        const msg = ctxStore.findById(teamId, planMessageId);
        if (!msg || msg.kind !== 'plan_proposal') return;
        for (const item of msg.items.filter(i => itemIds.includes(i.id))) {
          team.agents.push({
            id: `agent-${Math.random().toString(36).slice(2, 9)}`,
            role: item.title,
            name: item.title.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
            status: 'idle',
            progress: 0,
            model: 'sonnet',
          });
        }
        ctxAdapter.emitEvent(teamId, planMessageId, {
          phase: 'team', status: 'completed',
          detail: `Added: ${msg.items.filter(i => itemIds.includes(i.id)).map(i => i.title).join(', ')}`,
        });
      },
    });

    // Turn 1: user sends goal → provider replies with plan_proposal
    await request(app).post('/api/teams/t1/messages').send({ content: 'build me a landing page' });
    const thread = store.get('t1');
    const proposal = thread.find(m => m.kind === 'plan_proposal');
    expect(proposal).toBeDefined();

    // Turn 2: approve both items
    await request(app)
      .post(`/api/teams/t1/messages/${proposal!.id}/approve`)
      .send({ itemIds: ['a', 'b'] });

    // Verify: both agents on the team
    expect(team.agents).toHaveLength(2);
    expect(team.agents.map(a => a.role).sort()).toEqual(['backend-architect', 'frontend-developer']);

    // Verify: execution_status row in the thread, linked to the proposal
    const statusRow = store.get('t1').find(m => m.kind === 'execution_status');
    expect(statusRow).toBeDefined();
    if (statusRow && statusRow.kind === 'execution_status') {
      expect(statusRow.planMessageId).toBe(proposal!.id);
      expect(statusRow.status).toBe('completed');
    }

    // Verify: chat:message emits included the execution_status row
    const emittedKinds = emits
      .filter(e => e.event === 'chat:message')
      .map(e => (e.payload as { message: { kind: string } }).message.kind);
    expect(emittedKinds).toContain('execution_status');

    expect(approveSpy).toHaveBeenCalled();
  });
});

describe('Notion-parented project doc flow', () => {
  beforeEach(() => {
    createProjectPageMock.mockReset();
    createTaskTicketMock.mockReset();
    updateTicketStatusMock.mockReset();
    appendAgentReportMock.mockReset();
    appendProjectBlocksMock.mockReset();
    archiveProjectPageMock.mockReset();
  });

  it('creates the project page, parents task tickets under it, updates status', async () => {
    createProjectPageMock.mockResolvedValue('page-xyz');
    createTaskTicketMock.mockResolvedValue('ticket-1');

    const sink = resolveProjectDoc({ localRootDir: '/tmp-ignored' });
    await sink.createProject({ projectId: 'p1', name: 'Smoke', path: '/tmp' });
    expect(createProjectPageMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Smoke', path: '/tmp' }));

    const { ticketRef } = await sink.appendTask('p1', {
      title: 'Hero', items: ['Hero section', 'CTA'], agents: ['frontend-developer'],
    });
    expect(createTaskTicketMock).toHaveBeenCalledWith(expect.objectContaining({
      parentPageId: 'page-xyz',
      projectName: 'Smoke',
    }));
    expect(ticketRef).toBe('ticket-1');

    await sink.updateTaskStatus('p1', ticketRef, 'Done');
    expect(updateTicketStatusMock).toHaveBeenCalledWith('ticket-1', 'Done');

    await sink.appendTeamComposition('p1', [{ role: 'frontend-developer', rationale: 'UI' }]);
    expect(appendProjectBlocksMock).toHaveBeenCalledWith('page-xyz', expect.any(Array));
  });
});
