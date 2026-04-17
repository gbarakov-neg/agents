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
  description?: string;
  createdAt: string;
}

export interface Instruction {
  id: string;
  teamId: string;
  projectId?: string;
  content: string;
  status: 'pending' | 'acknowledged' | 'executing' | 'done' | 'failed';
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
