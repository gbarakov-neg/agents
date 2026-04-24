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
      getAvailableAgents: () => [],
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
      getAvailableAgents: () => [],
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
      getAvailableAgents: () => [],
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
});
