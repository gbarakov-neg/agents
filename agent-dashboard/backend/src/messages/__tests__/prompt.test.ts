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

  const catalog = [
    { name: 'frontend-developer', description: 'builds UIs' },
    { name: 'backend-architect', description: 'designs APIs' },
    { name: 'product-owner', description: 'defines requirements' },
    { name: 'code-reviewer', description: 'reviews code' },
    { name: 'security-auditor', description: 'audits security' },
    { name: 'test-automator', description: 'writes tests' },
    { name: 'perfume-stylist', description: 'designs fragrances' },
  ];

  it('enters intake mode when team is empty and catalog is provided', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [], availableAgents: catalog,
    });
    expect(prompt).toMatch(/has no agents yet/i);
    expect(prompt).toMatch(/add_agent/);
    expect(prompt).toContain('frontend-developer');
  });

  it('stays in normal mode when team has agents', () => {
    const prompt = buildOrchestratorPrompt({
      team, project, thread: [], availableAgents: catalog,
    });
    expect(prompt).not.toMatch(/has no agents yet/i);
  });

  it('includes a truncation note when pre-filter matches exceed 40', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const big = Array.from({ length: 60 }, (_, i) => ({
      name: `perfume-agent-${i}`,
      description: `perfume related agent ${i}`,
    }));
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [
        { id: 'u1', role: 'user', kind: 'text', content: 'help me with a perfume app',
          createdAt: new Date().toISOString() },
      ],
      availableAgents: [...big, ...catalog],
    });
    expect(prompt).toMatch(/narrow your ask/i);
  });

  it('emits fallback hint when no keywords match', () => {
    const emptyTeam = { id: 't1', name: 'T', agents: [] };
    const prompt = buildOrchestratorPrompt({
      team: emptyTeam, project, thread: [
        { id: 'u1', role: 'user', kind: 'text', content: 'hi',
          createdAt: new Date().toISOString() },
      ],
      availableAgents: catalog,
    });
    expect(prompt).toMatch(/tell me more about the project/i);
  });
});
