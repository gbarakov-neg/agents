export interface AgentReport {
  agentName: string;
  role: string;
  task: string;
  status: string;
  reasoning: string;
  filesChanged: string[];
  summary: string;
  output?: string;
}

export interface ProjectInput {
  projectId: string;
  name: string;
  path: string;
  url?: string;
  description?: string;
}

export interface TeamCompositionEntry {
  role: string;
  rationale: string;
}

export interface AppendTaskInput {
  title: string;
  items: string[];       // approved plan-item titles
  agents: string[];      // agent names on the team at dispatch time
}

export interface ProjectDocSink {
  createProject(input: ProjectInput): Promise<void>;
  appendBrief(projectId: string, userMessage: string): Promise<void>;
  appendTeamComposition(projectId: string, entries: TeamCompositionEntry[]): Promise<void>;
  appendTask(projectId: string, input: AppendTaskInput): Promise<{ ticketRef?: string }>;
  updateTaskStatus(projectId: string, ticketRef: string | undefined, status: 'Done' | 'Failed'): Promise<void>;
  appendAgentReport(projectId: string, ticketRef: string | undefined, report: AgentReport): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
