export interface AvailableAgent {
  name: string;
  description: string;
  model: string;
  plugin: string;
  filePath: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  url?: string;
  description?: string;
  createdAt: string;
  docRef?: string;
}

export interface Instruction {
  id: string;
  teamId: string;
  projectId?: string;
  content: string;
  status: 'pending' | 'acknowledged' | 'executing' | 'clarifying' | 'done' | 'failed';
  createdAt: string;
  acknowledgedAt?: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'complete' | 'failed';
  currentTask?: string;
  progress: number;
  model: string;
  output?: string;
  filesChanged?: string[];
  plugin?: string;
}

export interface Team {
  id: string;
  name: string;
  phase: string;
  status: 'planning' | 'active' | 'paused' | 'complete';
  agents: Agent[];
  projectId?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  orchestratorProvider?: 'claude' | 'openai';
  orchestratorModel?: string;
}

export interface WorkflowPhase {
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'complete' | 'blocked';
  agents: string[];
  estimatedDuration: number;
  startTime?: string;
  endTime?: string;
}

export interface Insight {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  action: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  teamId: string;
  agentId?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface AgentResult {
  agentId: string;
  teamId: string;
  output: string;
  filesChanged: string[];
  exitCode: number | null;
  startedAt: string;
  completedAt: string;
}

export type Priority = 'high' | 'medium' | 'low';

export type PlanItemKind = 'work' | 'add_agent';

export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
  kind?: PlanItemKind;
}

export type ExecutionStatusCode = 'started' | 'progress' | 'completed' | 'failed';
export type Approval = 'pending' | 'approved' | 'declined';

export type Message =
  | { id: string; role: 'user' | 'assistant'; kind: 'text';
      content: string; createdAt: string }
  | { id: string; role: 'assistant'; kind: 'plan_proposal';
      summary: string; items: PlanProposalItem[];
      approval: Approval; approvedItemIds?: string[];
      createdAt: string }
  | { id: string; role: 'system'; kind: 'execution_status';
      planMessageId: string; phase: string;
      agentId?: string; status: ExecutionStatusCode;
      detail?: string; createdAt: string };
