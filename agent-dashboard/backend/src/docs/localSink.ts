import { mkdir, writeFile, appendFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ProjectDocSink, ProjectInput, TeamCompositionEntry,
  AppendTaskInput, AgentReport,
} from './types';

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
}

function stamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export class LocalMarkdownProjectDoc implements ProjectDocSink {
  constructor(private readonly rootDir: string) {}

  private projectDir(projectId: string): string {
    return join(this.rootDir, projectId);
  }
  private projectMd(projectId: string): string {
    return join(this.projectDir(projectId), 'project.md');
  }

  async createProject(input: ProjectInput): Promise<void> {
    await mkdir(this.projectDir(input.projectId), { recursive: true });
    const content =
      `# ${input.name}\n\n` +
      `- **Path:** \`${input.path}\`\n` +
      (input.url ? `- **URL:** ${input.url}\n` : '') +
      (input.description ? `- **Description:** ${input.description}\n` : '') +
      `- **Created:** ${new Date().toISOString()}\n` +
      `\n## Brief\n\n` +
      `## Team composition\n\n`;
    await writeFile(this.projectMd(input.projectId), content);
  }

  async appendBrief(projectId: string, userMessage: string): Promise<void> {
    if (!existsSync(this.projectMd(projectId))) return;
    const line = `\n- _${new Date().toISOString()}_ — ${userMessage.replace(/\n/g, ' ')}\n`;
    await appendFile(this.projectMd(projectId), line);
  }

  async appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void> {
    if (!existsSync(this.projectMd(projectId))) return;
    const block = `\n### Team composition — ${new Date().toISOString()}\n\n` +
      entries.map(e => `- **${e.role}** — ${e.rationale}`).join('\n') + `\n`;
    await appendFile(this.projectMd(projectId), block);
  }

  async appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }> {
    const dir = join(this.projectDir(projectId), 'tasks');
    await mkdir(dir, { recursive: true });
    const file = `${stamp()}-${slug(input.title)}.md`;
    const relative = join('tasks', file);
    const content =
      `# ${input.title}\n\n` +
      `- **Created:** ${new Date().toISOString()}\n` +
      `- **Status:** In Progress\n` +
      `- **Agents:** ${input.agents.join(', ') || '(none)'}\n\n` +
      `## Items\n\n` +
      input.items.map(i => `- ${i}`).join('\n') + `\n\n` +
      `## Reports\n\n`;
    await writeFile(join(this.projectDir(projectId), relative), content);
    return { ticketRef: relative };
  }

  async updateTaskStatus(projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void> {
    if (!ticketRef) return;
    const path = join(this.projectDir(projectId), ticketRef);
    if (!existsSync(path)) return;
    await appendFile(path, `\n\nStatus: ${status} (updated ${new Date().toISOString()})\n`);
  }

  async appendAgentReport(projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void> {
    if (!ticketRef) return;
    const path = join(this.projectDir(projectId), ticketRef);
    if (!existsSync(path)) return;
    const block =
      `\n### ${report.agentName} (${report.role}) — ${report.status}\n\n` +
      `**Task:** ${report.task}\n\n` +
      (report.reasoning ? `**Reasoning:** ${report.reasoning}\n\n` : '') +
      (report.filesChanged.length > 0 ? `**Files changed:**\n` + report.filesChanged.map(f => `- \`${f}\``).join('\n') + `\n\n` : '') +
      (report.summary ? `**Summary:** ${report.summary}\n\n` : '');
    await appendFile(path, block);
  }

  async deleteProject(projectId: string): Promise<void> {
    await rm(this.projectDir(projectId), { recursive: true, force: true });
  }
}
