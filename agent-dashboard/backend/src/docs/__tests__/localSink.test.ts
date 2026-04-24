import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalMarkdownProjectDoc } from '../localSink';

describe('LocalMarkdownProjectDoc', () => {
  let root: string;
  let sink: LocalMarkdownProjectDoc;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'docsink-'));
    sink = new LocalMarkdownProjectDoc(root);
  });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });

  it('creates project.md with front-matter on createProject', async () => {
    await sink.createProject({
      projectId: 'p1', name: 'My App', path: '/work/app',
      description: 'A cool app', url: 'https://x.example',
    });
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toContain('My App');
    expect(md).toContain('/work/app');
    expect(md).toContain('A cool app');
    expect(md).toContain('https://x.example');
  });

  it('appends brief entries', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendBrief('p1', 'Users = public');
    await sink.appendBrief('p1', 'Tech = Next.js');
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toMatch(/Users = public/);
    expect(md).toMatch(/Tech = Next\.js/);
  });

  it('appends team composition entries', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendTeamComposition('p1', [
      { role: 'frontend-developer', rationale: 'for the UI' },
      { role: 'backend-architect', rationale: 'for the API' },
    ]);
    const md = await readFile(join(root, 'p1', 'project.md'), 'utf-8');
    expect(md).toMatch(/frontend-developer/);
    expect(md).toMatch(/backend-architect/);
  });

  it('creates a task markdown and returns its ref', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    const { ticketRef } = await sink.appendTask('p1', {
      title: 'Redesign hero', items: ['Hero section', 'CTA'], agents: ['frontend-developer'],
    });
    expect(ticketRef).toBeDefined();
    const files = await readdir(join(root, 'p1', 'tasks'));
    expect(files).toHaveLength(1);
    const md = await readFile(join(root, 'p1', ticketRef!), 'utf-8');
    expect(md).toMatch(/Redesign hero/);
    expect(md).toMatch(/- Hero section/);
  });

  it('updateTaskStatus appends a status line', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    const { ticketRef } = await sink.appendTask('p1', {
      title: 't', items: ['x'], agents: [],
    });
    await sink.updateTaskStatus('p1', ticketRef, 'Done');
    const md = await readFile(join(root, 'p1', ticketRef!), 'utf-8');
    expect(md).toMatch(/Status: Done/);
  });

  it('appendAgentReport with undefined ticketRef is a no-op (no crash)', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.appendAgentReport('p1', undefined, {
      agentName: 'X', role: 'r', task: 't', status: 'complete',
      reasoning: '', filesChanged: [], summary: '',
    });
    // project.md should exist and be unchanged by the no-op
    const files = await readdir(join(root, 'p1'));
    expect(files).toContain('project.md');
  });

  it('deleteProject removes the project directory', async () => {
    await sink.createProject({ projectId: 'p1', name: 'n', path: '/p' });
    await sink.deleteProject('p1');
    await expect(readFile(join(root, 'p1', 'project.md'), 'utf-8')).rejects.toThrow();
  });
});
