import {
  createProjectPage, createTaskTicket, updateTicketStatus,
  appendAgentReport as notionAppendReport,
  appendProjectBlocks, archiveProjectPage,
} from '../../notion.js';
import type {
  ProjectDocSink, ProjectInput, TeamCompositionEntry,
  AppendTaskInput, AgentReport,
} from './types';

interface ProjectEntry {
  pageId: string;
  projectName: string;
}

export class NotionProjectDoc implements ProjectDocSink {
  private readonly projects = new Map<string, ProjectEntry>();

  async createProject(input: ProjectInput): Promise<void> {
    const pageId = await createProjectPage({
      name: input.name,
      path: input.path,
      url: input.url,
      description: input.description,
    });
    if (pageId) {
      this.projects.set(input.projectId, { pageId, projectName: input.name });
    }
  }

  async appendBrief(projectId: string, userMessage: string): Promise<void> {
    const entry = this.projects.get(projectId);
    if (!entry) return;
    const ts = new Date().toISOString();
    const blocks = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `[${ts}] ${userMessage}` } }],
        },
      },
    ];
    await appendProjectBlocks(entry.pageId, blocks);
  }

  async appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void> {
    const entry = this.projects.get(projectId);
    if (!entry) return;
    const ts = new Date().toISOString();
    const blocks: any[] = [
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: `Team composition — ${ts}` } }],
        },
      },
      ...entries.map(e => ({
        object: 'block' as const,
        type: 'bulleted_list_item' as const,
        bulleted_list_item: {
          rich_text: [{ type: 'text' as const, text: { content: `${e.role} — ${e.rationale}` } }],
        },
      })),
    ];
    await appendProjectBlocks(entry.pageId, blocks);
  }

  async appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }> {
    const entry = this.projects.get(projectId);
    const pageId = await createTaskTicket({
      title: input.title,
      teamName: '',
      projectName: entry?.projectName ?? projectId,
      instruction: input.items.join('\n'),
      agents: input.agents,
      parentPageId: entry?.pageId,
    });
    return { ticketRef: pageId ?? undefined };
  }

  async updateTaskStatus(_projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void> {
    if (!ticketRef) return;
    await updateTicketStatus(ticketRef, status);
  }

  async appendAgentReport(_projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void> {
    if (!ticketRef) return;
    await notionAppendReport(ticketRef, {
      agentName: report.agentName,
      role: report.role,
      task: report.task,
      status: report.status,
      output: report.output ?? '',
      filesChanged: report.filesChanged,
      reasoning: report.reasoning,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const entry = this.projects.get(projectId);
    if (!entry) return;
    await archiveProjectPage(entry.pageId);
    this.projects.delete(projectId);
  }
}
