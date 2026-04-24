import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  createProjectPageMock, createTaskTicketMock, updateTicketStatusMock,
  appendAgentReportMock, appendProjectBlocksMock, archiveProjectPageMock,
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

import { NotionProjectDoc } from '../notionSink';

describe('NotionProjectDoc', () => {
  let sink: NotionProjectDoc;

  beforeEach(() => {
    createProjectPageMock.mockReset();
    createTaskTicketMock.mockReset();
    updateTicketStatusMock.mockReset();
    appendAgentReportMock.mockReset();
    appendProjectBlocksMock.mockReset();
    archiveProjectPageMock.mockReset();
    sink = new NotionProjectDoc();
  });

  it('createProject stores page id and project name and remembers both', async () => {
    createProjectPageMock.mockResolvedValue('page-abc');
    await sink.createProject({ projectId: 'p1', name: 'App', path: '/p' });
    await sink.appendTask('p1', { title: 't', items: ['a'], agents: ['frontend-developer'] });
    expect(createTaskTicketMock).toHaveBeenCalledWith(expect.objectContaining({
      parentPageId: 'page-abc',
      projectName: 'App',   // real name, not the opaque projectId
    }));
  });

  it('appendTask without prior createProject still calls createTaskTicket (no parent)', async () => {
    createTaskTicketMock.mockResolvedValue('tkt-1');
    const { ticketRef } = await sink.appendTask('unknown', { title: 't', items: [], agents: [] });
    expect(createTaskTicketMock).toHaveBeenCalledWith(expect.objectContaining({
      parentPageId: undefined,
    }));
    expect(ticketRef).toBe('tkt-1');
  });

  it('appendBrief calls appendProjectBlocks with the stored page id', async () => {
    createProjectPageMock.mockResolvedValue('page-abc');
    await sink.createProject({ projectId: 'p1', name: 'App', path: '/p' });
    await sink.appendBrief('p1', 'Users are chefs');
    expect(appendProjectBlocksMock).toHaveBeenCalledWith('page-abc', expect.any(Array));
    const [, blocks] = appendProjectBlocksMock.mock.calls[0];
    const asJson = JSON.stringify(blocks);
    expect(asJson).toContain('Users are chefs');
  });

  it('appendBrief is a no-op when the project has no stored page id', async () => {
    await sink.appendBrief('unknown', 'x');
    expect(appendProjectBlocksMock).not.toHaveBeenCalled();
  });

  it('appendTeamComposition appends a heading + one bullet per role', async () => {
    createProjectPageMock.mockResolvedValue('page-abc');
    await sink.createProject({ projectId: 'p1', name: 'App', path: '/p' });
    await sink.appendTeamComposition('p1', [
      { role: 'frontend-developer', rationale: 'UI' },
      { role: 'backend-architect', rationale: 'API' },
    ]);
    expect(appendProjectBlocksMock).toHaveBeenCalledWith('page-abc', expect.any(Array));
    const asJson = JSON.stringify(appendProjectBlocksMock.mock.calls[0][1]);
    expect(asJson).toContain('frontend-developer');
    expect(asJson).toContain('backend-architect');
    expect(asJson).toContain('UI');
    expect(asJson).toContain('API');
  });

  it('updateTaskStatus passes the ticketRef through', async () => {
    await sink.updateTaskStatus('p1', 'tkt-1', 'Done');
    expect(updateTicketStatusMock).toHaveBeenCalledWith('tkt-1', 'Done');
  });

  it('updateTaskStatus with undefined ticketRef is a no-op', async () => {
    await sink.updateTaskStatus('p1', undefined, 'Done');
    expect(updateTicketStatusMock).not.toHaveBeenCalled();
  });

  it('appendAgentReport with undefined ticketRef is a no-op', async () => {
    await sink.appendAgentReport('p1', undefined, {
      agentName: 'a', role: 'r', task: 't', status: 'complete',
      reasoning: '', filesChanged: [], summary: '',
    });
    expect(appendAgentReportMock).not.toHaveBeenCalled();
  });

  it('deleteProject archives the page and forgets the mapping', async () => {
    createProjectPageMock.mockResolvedValue('page-abc');
    await sink.createProject({ projectId: 'p1', name: 'App', path: '/p' });
    await sink.deleteProject('p1');
    expect(archiveProjectPageMock).toHaveBeenCalledWith('page-abc');
    // follow-up appendBrief should no-op now (mapping cleared)
    appendProjectBlocksMock.mockReset();
    await sink.appendBrief('p1', 'should-not-appear');
    expect(appendProjectBlocksMock).not.toHaveBeenCalled();
  });

  it('deleteProject without a prior createProject is a no-op', async () => {
    await sink.deleteProject('never-existed');
    expect(archiveProjectPageMock).not.toHaveBeenCalled();
  });
});
