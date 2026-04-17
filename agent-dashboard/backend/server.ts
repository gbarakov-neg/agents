import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { spawn, ChildProcess } from 'child_process';
import { readdir, readFile, writeFile, stat, mkdir } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { existsSync } from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

// ============================================================
// CONFIGURATION
// ============================================================

const PLUGINS_DIR = process.env.PLUGINS_DIR || join(process.cwd(), '..', '..', 'plugins');

// ============================================================
// STATE MANAGEMENT
// ============================================================

interface AvailableAgent {
  name: string;
  description: string;
  model: string;
  plugin: string;
  filePath: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  description?: string;
  createdAt: string;
}

interface Instruction {
  id: string;
  teamId: string;
  projectId?: string;
  content: string;
  status: 'pending' | 'acknowledged' | 'executing' | 'done' | 'failed';
  createdAt: string;
  acknowledgedAt?: string;
}

interface AgentResult {
  agentId: string;
  teamId: string;
  output: string;
  filesChanged: string[];
  exitCode: number | null;
  startedAt: string;
  completedAt: string;
}

interface Agent {
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

interface Team {
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

interface WorkflowPhase {
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'complete' | 'blocked';
  agents: string[];
  startTime?: string;
  endTime?: string;
  estimatedDuration: number;
}

interface LogEntry {
  id: string;
  timestamp: string;
  teamId: string;
  agentId?: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const availableAgents: AvailableAgent[] = [];
const projectsState = new Map<string, Project>();
const instructionsState: Instruction[] = [];
const teamsState = new Map<string, Team>();
const phasesState = new Map<string, WorkflowPhase[]>();
const logsState: LogEntry[] = [];
const resultsState: AgentResult[] = [];
const runningProcesses = new Map<string, ChildProcess>();

// ============================================================
// PERSISTENCE
// ============================================================

const DATA_DIR = join(process.cwd(), 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

interface PersistedState {
  projects: Project[];
  teams: Team[];
  instructions: Instruction[];
  results: AgentResult[];
  chatHistories?: Record<string, ChatMessage[]>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave() {
  if (saveTimer) return; // already scheduled
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveState().catch(err => console.error('Failed to save state:', err));
  }, 500);
}

async function saveState() {
  // Strip runtime-only fields (output can be large, processes can't be serialized)
  const teams = Array.from(teamsState.values()).map(t => ({
    ...t,
    agents: t.agents.map(a => ({
      ...a,
      output: undefined, // don't persist large output blobs
    }))
  }));

  // Persist chat histories (last 20 messages per team)
  const chats: Record<string, ChatMessage[]> = {};
  for (const [teamId, msgs] of chatHistories) {
    chats[teamId] = msgs.slice(-20);
  }

  const data: PersistedState = {
    projects: Array.from(projectsState.values()),
    teams,
    instructions: instructionsState,
    results: resultsState.slice(-100),
    chatHistories: chats,
  };

  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(data, null, 2));
}

async function loadState() {
  try {
    if (!existsSync(STATE_FILE)) return;
    const raw = await readFile(STATE_FILE, 'utf-8');
    const data: PersistedState = JSON.parse(raw);

    for (const p of data.projects || []) projectsState.set(p.id, p);
    for (const t of data.teams || []) {
      // Reset any agents that were "working" to "idle" (process is gone after restart)
      for (const a of t.agents) {
        if (a.status === 'working' || a.status === 'blocked') {
          a.status = 'idle';
          a.progress = 0;
          a.currentTask = undefined;
        }
      }
      teamsState.set(t.id, t);
    }
    instructionsState.push(...(data.instructions || []));
    // Reset any executing instructions to pending (agents were killed on restart)
    for (const instr of instructionsState) {
      if (instr.status === 'executing' || instr.status === 'pending') {
        instr.status = 'pending';
      }
    }
    resultsState.push(...(data.results || []));

    // Load chat histories
    if (data.chatHistories) {
      for (const [teamId, msgs] of Object.entries(data.chatHistories)) {
        chatHistories.set(teamId, msgs);
      }
    }

    console.log(`Loaded state: ${projectsState.size} projects, ${teamsState.size} teams, ${instructionsState.length} instructions`);
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

// Auto-save when state-changing events are emitted
const origEmit = io.emit.bind(io);
io.emit = ((event: string, ...args: unknown[]) => {
  const result = origEmit(event, ...args);
  if (typeof event === 'string' && (
    event.startsWith('team:') ||
    event.startsWith('project:') ||
    event.startsWith('instruction:') ||
    event === 'agent:updated'
  )) {
    scheduleSave();
  }
  return result;
}) as typeof io.emit;

// ============================================================
// SCAN PLUGINS FOR REAL AGENTS
// ============================================================

async function scanAgents() {
  try {
    const plugins = await readdir(PLUGINS_DIR);
    for (const plugin of plugins) {
      const agentsDir = join(PLUGINS_DIR, plugin, 'agents');
      try {
        const agentStat = await stat(agentsDir);
        if (!agentStat.isDirectory()) continue;

        const files = await readdir(agentsDir);
        for (const file of files) {
          if (!file.endsWith('.md') || file === 'README.md') continue;
          try {
            const content = await readFile(join(agentsDir, file), 'utf-8');
            const frontmatter = parseFrontmatter(content);
            if (frontmatter.name) {
              availableAgents.push({
                name: frontmatter.name,
                description: (frontmatter.description || '').substring(0, 200),
                model: frontmatter.model || 'inherit',
                plugin,
                filePath: join(agentsDir, file)
              });
            }
          } catch { /* skip unreadable files */ }
        }
      } catch { /* no agents dir */ }
    }
    console.log(`Scanned ${availableAgents.length} agents from ${plugins.length} plugins`);
  } catch (err) {
    console.error('Failed to scan plugins:', err);
  }
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.substring(0, idx).trim();
      let val = line.substring(idx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

// ============================================================
// CLAUDE CLI EXECUTION
// ============================================================

function executeAgent(
  agent: Agent,
  team: Team,
  instruction: string,
  projectPath: string
) {
  const agentDef = availableAgents.find(a => a.name === agent.role);
  const systemPrompt = agentDef
    ? `You are the ${agentDef.name} agent from the ${agentDef.plugin} plugin. ${agentDef.description}`
    : `You are a ${agent.role} agent.`;

  const prompt = `${systemPrompt}\n\nYour task:\n${instruction}\n\nWork in the project directory. Make the necessary changes. Be concise in your output.`;

  // Determine model flag
  let modelFlag: string;
  const agentModel = agent.model;
  if (agentModel.includes('opus')) modelFlag = 'opus';
  else if (agentModel.includes('haiku')) modelFlag = 'haiku';
  else modelFlag = 'sonnet';

  agent.status = 'working';
  agent.currentTask = instruction.substring(0, 100);
  agent.progress = 10;
  agent.output = '';
  agent.filesChanged = [];
  io.emit('agent:updated', { teamId: team.id, agent });

  addLog(team.id, agent.id, 'info', `${agent.name} starting work on: ${instruction.substring(0, 80)}...`);

  const args = [
    '--print',
    '--model', modelFlag,
  ];

  const proc = spawn('claude', args, {
    cwd: projectPath,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  proc.stdin?.write(prompt);
  proc.stdin?.end();

  runningProcesses.set(agent.id, proc);

  let output = '';
  let progressInterval: ReturnType<typeof setInterval>;

  // Tick progress while running
  progressInterval = setInterval(() => {
    if (agent.status === 'working' && agent.progress < 90) {
      agent.progress = Math.min(90, agent.progress + 5 + Math.floor(Math.random() * 10));
      io.emit('agent:updated', { teamId: team.id, agent });
    }
  }, 3000);

  proc.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    output += chunk;
    agent.output = output;

    // Stream output lines to logs
    for (const line of chunk.split('\n').filter((l: string) => l.trim())) {
      addLog(team.id, agent.id, 'info', line.substring(0, 200));
    }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    output += chunk;
    addLog(team.id, agent.id, 'warn', chunk.substring(0, 200));
  });

  proc.on('close', (code) => {
    clearInterval(progressInterval);
    runningProcesses.delete(agent.id);

    agent.progress = 100;
    agent.output = output;
    agent.status = code === 0 ? 'complete' : 'failed';

    // Detect changed files from git
    detectChangedFiles(projectPath).then(files => {
      agent.filesChanged = files;
      io.emit('agent:updated', { teamId: team.id, agent });

      resultsState.push({
        agentId: agent.id,
        teamId: team.id,
        output,
        filesChanged: files,
        exitCode: code,
        startedAt: team.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString()
      });

      addLog(team.id, agent.id, code === 0 ? 'info' : 'error',
        `${agent.name} ${code === 0 ? 'completed' : `failed (exit ${code})`}. ${files.length} file(s) changed.`
      );

      // Check if all agents done
      checkTeamCompletion(team);
    });
  });

  proc.on('error', (err) => {
    clearInterval(progressInterval);
    runningProcesses.delete(agent.id);
    agent.status = 'failed';
    agent.progress = 100;
    agent.output = `Error: ${err.message}`;
    io.emit('agent:updated', { teamId: team.id, agent });
    addLog(team.id, agent.id, 'error', `${agent.name} failed to start: ${err.message}`);
    checkTeamCompletion(team);
  });
}

async function detectChangedFiles(projectPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const git = spawn('git', ['diff', '--name-only', 'HEAD'], { cwd: projectPath });
    let out = '';
    git.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    git.on('close', () => {
      // Also check untracked
      const git2 = spawn('git', ['ls-files', '--others', '--exclude-standard'], { cwd: projectPath });
      let out2 = '';
      git2.stdout?.on('data', (d: Buffer) => { out2 += d.toString(); });
      git2.on('close', () => {
        const files = [...out.split('\n'), ...out2.split('\n')].filter(f => f.trim());
        resolve([...new Set(files)]);
      });
      git2.on('error', () => resolve(out.split('\n').filter(f => f.trim())));
    });
    git.on('error', () => resolve([]));
  });
}

function checkTeamCompletion(team: Team) {
  const allDone = team.agents.length > 0 &&
    team.agents.every(a => a.status === 'complete' || a.status === 'failed' || a.status === 'idle');

  if (allDone) {
    for (const instr of instructionsState) {
      if (instr.teamId === team.id && instr.status === 'executing') {
        const anyFailed = team.agents.some(a => a.status === 'failed');
        instr.status = anyFailed ? 'failed' : 'done';
        io.emit('instruction:updated', instr);
        addLog(team.id, undefined, anyFailed ? 'warn' : 'info',
          `Instruction ${anyFailed ? 'completed with errors' : 'completed successfully'}`
        );
      }
    }
  }
}

function addLog(teamId: string, agentId: string | undefined, level: 'info' | 'warn' | 'error', message: string) {
  const entry: LogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    teamId,
    agentId,
    level,
    message
  };
  logsState.push(entry);
  io.emit('log:created', entry);
}

// ============================================================
// ORCHESTRATOR
// ============================================================

interface OrchestratorPlan {
  phases: {
    name: string;
    agentRoles: string[];
    tasks: Record<string, string>; // role -> specific task
  }[];
}

// Analyze task and compose the right team from the plugin catalog
async function composeTeam(team: Team, instruction: string, projectPath: string): Promise<void> {
  // Build a condensed catalog of available agents (grouped by plugin, top 60 to fit in context)
  const catalog = availableAgents
    .map(a => `${a.name} (${a.plugin}): ${a.description.substring(0, 80)}`)
    .join('\n');

  const currentRoles = team.agents.map(a => a.role);
  const currentList = currentRoles.length > 0
    ? `Current team members: ${currentRoles.join(', ')}`
    : 'Current team: empty';

  const prompt = `You are a team composition expert. Given a task and a catalog of available agents, decide which agents are needed.

Task: ${instruction}

${currentList}

Available agents catalog:
${catalog}

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "add": [{"name": "agent-name-from-catalog", "reason": "why needed"}],
  "remove": [{"name": "current-role-to-remove", "reason": "why not needed"}],
  "keep": ["current-role-to-keep"]
}

Rules:
- Add agents that are essential for the task but missing from the team
- Remove agents that are clearly irrelevant to this specific task
- Keep agents that are useful
- Be selective: 3-6 agents total is ideal, don't add more than needed
- Use exact agent names from the catalog`;

  return new Promise((resolve) => {
    const proc = spawn('claude', ['--print', '--model', 'haiku'], {
      cwd: projectPath,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard-composer' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.stdin?.write(prompt);
    proc.stdin?.end();

    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr?.on('data', (_d: Buffer) => { /* ignore stderr */ });

    proc.on('close', () => {
      try {
        const jsonMatch = out.match(/\{[\s\S]*\}/);
        if (!jsonMatch) { resolve(); return; }

        const composition = JSON.parse(jsonMatch[0]) as {
          add?: { name: string; reason: string }[];
          remove?: { name: string; reason: string }[];
          keep?: string[];
        };

        // Add recommended agents
        if (composition.add) {
          for (const rec of composition.add) {
            // Skip if already on team
            if (team.agents.some(a => a.role === rec.name)) continue;

            const catalogEntry = availableAgents.find(a => a.name === rec.name);
            if (!catalogEntry) continue;

            const model = catalogEntry.model === 'opus' ? 'claude-opus-4-6'
              : catalogEntry.model === 'haiku' ? 'claude-haiku-4-5-20251001'
              : 'claude-sonnet-4-6';

            const displayName = rec.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const newAgent: Agent = {
              id: `agent-${Math.random().toString(36).substring(2, 11)}`,
              name: displayName,
              role: rec.name,
              status: 'idle',
              progress: 0,
              model,
              plugin: catalogEntry.plugin
            };
            team.agents.push(newAgent);
            addLog(team.id, newAgent.id, 'info', `Orchestrator auto-added ${displayName} (${catalogEntry.plugin}): ${rec.reason}`);
          }
        }

        // Remove irrelevant agents (only idle ones, don't kill working agents)
        if (composition.remove) {
          for (const rec of composition.remove) {
            const idx = team.agents.findIndex(a => a.role === rec.name && a.status === 'idle');
            if (idx >= 0) {
              const removed = team.agents.splice(idx, 1)[0];
              addLog(team.id, undefined, 'info', `Orchestrator removed ${removed.name}: ${rec.reason}`);
            }
          }
        }

        io.emit('team:updated', team);
      } catch { /* ignore parse errors, keep team as-is */ }
      resolve();
    });

    proc.on('error', () => resolve());

    // Timeout after 30s
    setTimeout(() => { try { proc.kill(); } catch {} resolve(); }, 30000);
  });
}

// Run Claude to create an execution plan
async function createPlan(team: Team, instruction: string, projectPath: string): Promise<OrchestratorPlan> {
  const agentList = team.agents.map(a => `- ${a.name} (role: ${a.role})`).join('\n');

  const prompt = `You are an orchestrator. Given a task and a list of agents, create a phased execution plan.

Task: ${instruction}

Available agents:
${agentList}

Respond with ONLY valid JSON (no markdown, no backticks). Create phases where:
- Phase 1 should be planning/architecture work (if relevant agents exist)
- Phase 2 should be parallel implementation
- Phase 3 should be testing/review/security (if relevant agents exist)
- Each agent appears in exactly one phase
- Each agent gets a specific sub-task relevant to their role

JSON format:
{"phases":[{"name":"Phase Name","agentRoles":["role1","role2"],"tasks":{"role1":"specific task for role1","role2":"specific task for role2"}}]}`;

  return new Promise((resolve) => {
    const proc = spawn('claude', ['--print', '--model', 'haiku'], {
      cwd: projectPath,
      env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard-orchestrator' },
      stdio: ['pipe', 'pipe', 'pipe']
    });
    proc.stdin?.write(prompt);
    proc.stdin?.end();

    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.stderr?.on('data', (d: Buffer) => { out += d.toString(); });

    proc.on('close', () => {
      try {
        // Try to extract JSON from the output
        const jsonMatch = out.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const plan = JSON.parse(jsonMatch[0]) as OrchestratorPlan;
          if (plan.phases && plan.phases.length > 0) {
            resolve(plan);
            return;
          }
        }
      } catch { /* fall through */ }

      // Fallback: single phase with all agents
      const tasks: Record<string, string> = {};
      for (const a of team.agents) {
        tasks[a.role] = instruction;
      }
      resolve({
        phases: [{ name: 'Execution', agentRoles: team.agents.map(a => a.role), tasks }]
      });
    });

    proc.on('error', () => {
      const tasks: Record<string, string> = {};
      for (const a of team.agents) {
        tasks[a.role] = instruction;
      }
      resolve({
        phases: [{ name: 'Execution', agentRoles: team.agents.map(a => a.role), tasks }]
      });
    });
  });
}

// Execute a single phase: run assigned agents in parallel, wait for all to finish
function executePhase(
  team: Team,
  phase: OrchestratorPlan['phases'][0],
  projectPath: string,
  priorContext: string
): Promise<string> {
  return new Promise((resolve) => {
    const phaseAgents = team.agents.filter(a =>
      phase.agentRoles.includes(a.role) &&
      (a.status === 'idle' || a.status === 'complete' || a.status === 'failed')
    );

    if (phaseAgents.length === 0) {
      resolve('(no agents matched this phase)');
      return;
    }

    let completed = 0;
    let phaseOutput = '';

    for (const agent of phaseAgents) {
      const task = phase.tasks[agent.role] || phase.tasks[Object.keys(phase.tasks)[0]] || 'Complete your part of the task';
      const fullPrompt = priorContext
        ? `${task}\n\nContext from previous phases:\n${priorContext}`
        : task;

      // Temporarily override close handler to track phase completion
      const origCheckTeam = checkTeamCompletion;
      const agentId = agent.id;

      executeAgent(agent, team, fullPrompt, projectPath);

      // Watch for this agent to finish
      const watcher = setInterval(() => {
        if (agent.status === 'complete' || agent.status === 'failed') {
          clearInterval(watcher);
          completed++;
          if (agent.output) {
            phaseOutput += `\n--- ${agent.name} (${agent.role}) ---\n${agent.output.substring(0, 2000)}\n`;
          }
          if (completed >= phaseAgents.length) {
            resolve(phaseOutput);
          }
        }
      }, 2000);
    }
  });
}

// Main orchestration: plan → execute phases sequentially
async function orchestrateTeam(team: Team, instruction: string) {
  const project = team.projectId ? projectsState.get(team.projectId) : undefined;
  if (!project) {
    addLog(team.id, undefined, 'error', 'Cannot execute: no project assigned or project not found');
    return;
  }

  // Phase 0: Team Composition
  team.phase = 'composing';
  io.emit('team:updated', team);
  addLog(team.id, undefined, 'info', `Orchestrator: analyzing task and composing team (${availableAgents.length} agents in catalog)...`);

  await composeTeam(team, instruction, project.path);
  addLog(team.id, undefined, 'info', `Orchestrator: team composed — ${team.agents.length} agent(s): ${team.agents.map(a => a.name).join(', ')}`);

  // Phase 1: Planning
  team.phase = 'planning';
  io.emit('team:updated', team);
  addLog(team.id, undefined, 'info', 'Orchestrator: creating execution plan...');

  const plan = await createPlan(team, instruction, project.path);
  addLog(team.id, undefined, 'info', `Orchestrator: plan created with ${plan.phases.length} phase(s): ${plan.phases.map(p => p.name).join(' → ')}`);

  // Store phases for the timeline
  phasesState.set(team.id, plan.phases.map(p => ({
    name: p.name,
    description: `Agents: ${p.agentRoles.join(', ')}`,
    status: 'pending' as const,
    agents: p.agentRoles,
    estimatedDuration: 5
  })));

  // Execute phases sequentially
  let priorContext = '';
  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i];
    const phases = phasesState.get(team.id)!;

    team.phase = phase.name.toLowerCase();
    phases[i].status = 'in-progress';
    phases[i].startTime = new Date().toISOString();
    io.emit('team:updated', team);
    io.emit('phase:updated', { teamId: team.id, phase: phases[i], index: i });

    addLog(team.id, undefined, 'info', `Orchestrator: starting phase "${phase.name}" with ${phase.agentRoles.length} agent(s)`);

    const phaseOutput = await executePhase(team, phase, project.path, priorContext);
    priorContext += phaseOutput;

    phases[i].status = 'complete';
    phases[i].endTime = new Date().toISOString();
    io.emit('phase:updated', { teamId: team.id, phase: phases[i], index: i });
    addLog(team.id, undefined, 'info', `Orchestrator: phase "${phase.name}" complete`);
  }

  addLog(team.id, undefined, 'info', 'Orchestrator: all phases complete');
}

// Execute a single agent directly (for per-agent instructions)
function dispatchSingleAgent(team: Team, agent: Agent, instruction: string) {
  const project = team.projectId ? projectsState.get(team.projectId) : undefined;
  if (!project) {
    addLog(team.id, undefined, 'error', 'Cannot execute: no project assigned');
    return;
  }
  executeAgent(agent, team, instruction, project.path);
  io.emit('team:updated', team);
}

// Simple dispatch: all agents in parallel, no orchestration
function dispatchTeamSimple(team: Team, instruction: string) {
  const project = team.projectId ? projectsState.get(team.projectId) : undefined;
  if (!project) {
    addLog(team.id, undefined, 'error', 'Cannot execute: no project assigned or project not found');
    return;
  }

  team.phase = 'implementation';

  for (const agent of team.agents) {
    if (agent.status === 'idle' || agent.status === 'complete' || agent.status === 'failed') {
      executeAgent(agent, team, instruction, project.path);
    }
  }

  io.emit('team:updated', team);
}

// ============================================================
// REST ENDPOINTS
// ============================================================

// Available agents from plugins
app.get('/api/available-agents', (_req, res) => {
  res.json({ agents: availableAgents });
});

app.get('/api/teams', (_req, res) => {
  const teams = Array.from(teamsState.values());
  res.json({ teams, count: teams.length });
});

app.get('/api/teams/:teamId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  res.json(team);
});

app.post('/api/teams', (req, res) => {
  const { name, agents, projectId, instructions } = req.body;
  const teamId = `team-${Date.now()}`;

  const newTeam: Team = {
    id: teamId,
    name,
    phase: 'planning',
    status: 'active',
    projectId: projectId || undefined,
    agents: (agents || []).map((agent: { name: string; role: string; model?: string; plugin?: string }) => ({
      id: `agent-${Math.random().toString(36).substring(2, 11)}`,
      name: agent.name,
      role: agent.role,
      status: 'idle' as const,
      progress: 0,
      model: agent.model || 'claude-sonnet-4-6',
      plugin: agent.plugin
    })),
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString()
  };

  teamsState.set(teamId, newTeam);
  addLog(teamId, undefined, 'info', `Team "${name}" created with ${newTeam.agents.length} agent(s)`);

  io.emit('team:created', newTeam);

  // If initial instructions, dispatch immediately
  if (instructions && typeof instructions === 'string' && instructions.trim()) {
    const instr: Instruction = {
      id: `instr-${Date.now()}`,
      teamId,
      projectId: projectId || undefined,
      content: instructions.trim(),
      status: 'executing',
      createdAt: new Date().toISOString(),
      acknowledgedAt: new Date().toISOString()
    };
    instructionsState.push(instr);
    io.emit('instruction:created', instr);

    // Orchestrate agents
    setTimeout(() => orchestrateTeam(newTeam, instructions.trim()), 500);
  }

  res.json(newTeam);
});

// Add agent to existing team
app.post('/api/teams/:teamId/agents', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const { name, role, model, plugin } = req.body;
  const agent: Agent = {
    id: `agent-${Math.random().toString(36).substring(2, 11)}`,
    name,
    role,
    status: 'idle',
    progress: 0,
    model: model || 'claude-sonnet-4-6',
    plugin
  };
  team.agents.push(agent);
  addLog(team.id, agent.id, 'info', `Agent "${name}" (${role}) added to team`);

  io.emit('team:updated', team);
  res.json(agent);
});

// Remove agent from team
app.delete('/api/teams/:teamId/agents/:agentId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const idx = team.agents.findIndex(a => a.id === req.params.agentId);
  if (idx === -1) return res.status(404).json({ error: 'Agent not found' });

  // Kill running process if any
  const proc = runningProcesses.get(team.agents[idx].id);
  if (proc) proc.kill();

  const [removed] = team.agents.splice(idx, 1);
  addLog(team.id, undefined, 'info', `Agent "${removed.name}" removed from team`);

  io.emit('team:updated', team);
  res.json({ ok: true });
});

app.patch('/api/teams/:teamId/agents/:agentId', (req, res) => {
  const { teamId, agentId } = req.params;
  const { status, progress, currentTask } = req.body;

  const team = teamsState.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const agent = team.agents.find(a => a.id === agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  if (status !== undefined) agent.status = status;
  if (progress !== undefined) agent.progress = progress;
  if (currentTask !== undefined) agent.currentTask = currentTask;

  io.emit('agent:updated', { teamId, agent });
  res.json(agent);
});

app.get('/api/teams/:teamId/phases', (req, res) => {
  const phases = phasesState.get(req.params.teamId) || [];
  res.json({ phases });
});

app.post('/api/teams/:teamId/pause', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'paused';
    // Kill all running processes
    for (const agent of team.agents) {
      const proc = runningProcesses.get(agent.id);
      if (proc) {
        proc.kill();
        agent.status = 'blocked';
        agent.currentTask = 'Paused';
      }
    }
    io.emit('team:updated', team);
  }
  res.json(team);
});

app.post('/api/teams/:teamId/resume', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'active';
    io.emit('team:updated', team);
  }
  res.json(team);
});

app.post('/api/teams/:teamId/shutdown', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'complete';
    team.completedAt = new Date().toISOString();
    // Kill all running processes
    for (const agent of team.agents) {
      const proc = runningProcesses.get(agent.id);
      if (proc) proc.kill();
    }
    io.emit('team:updated', team);
  }
  res.json(team);
});

// ============================================================
// PROJECTS
// ============================================================

app.get('/api/projects', (_req, res) => {
  res.json({ projects: Array.from(projectsState.values()) });
});

app.post('/api/projects', (req, res) => {
  const { name, path, description } = req.body;
  const id = `proj-${Date.now()}`;
  const project: Project = { id, name, path, description, createdAt: new Date().toISOString() };
  projectsState.set(id, project);
  io.emit('project:created', project);
  res.json(project);
});

app.delete('/api/projects/:projectId', (req, res) => {
  projectsState.delete(req.params.projectId);
  io.emit('project:deleted', { projectId: req.params.projectId });
  res.json({ ok: true });
});

app.patch('/api/teams/:teamId/project', (req, res) => {
  const { projectId } = req.body;
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  team.projectId = projectId || undefined;
  io.emit('team:updated', team);
  res.json(team);
});

// ============================================================
// INSTRUCTIONS
// ============================================================

app.get('/api/teams/:teamId/instructions', (req, res) => {
  const instructions = instructionsState.filter(i => i.teamId === req.params.teamId);
  res.json({ instructions });
});

app.post('/api/teams/:teamId/instructions', (req, res) => {
  const { content, mode, agentId } = req.body;
  // mode: 'orchestrate' (default) | 'parallel' | 'agent'
  const teamId = req.params.teamId;
  const team = teamsState.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const instruction: Instruction = {
    id: `instr-${Date.now()}`,
    teamId,
    projectId: team.projectId,
    content,
    status: 'executing',
    createdAt: new Date().toISOString(),
    acknowledgedAt: new Date().toISOString()
  };
  instructionsState.push(instruction);

  addLog(teamId, undefined, 'info', `Instruction received (${mode || 'orchestrate'}): "${content.length > 80 ? content.substring(0, 80) + '...' : content}"`);
  io.emit('instruction:created', instruction);

  if (agentId) {
    // Per-agent instruction
    const agent = team.agents.find(a => a.id === agentId);
    if (agent) {
      addLog(teamId, agentId, 'info', `Direct instruction to ${agent.name}: ${content.substring(0, 80)}`);
      dispatchSingleAgent(team, agent, content);
    }
  } else if (mode === 'parallel') {
    // Simple parallel dispatch
    dispatchTeamSimple(team, content);
  } else {
    // Orchestrated execution (default)
    orchestrateTeam(team, content);
  }

  res.json(instruction);
});

// Per-agent instruction endpoint
app.post('/api/teams/:teamId/agents/:agentId/instruct', (req, res) => {
  const { content } = req.body;
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const agent = team.agents.find(a => a.id === req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const instruction: Instruction = {
    id: `instr-${Date.now()}`,
    teamId: team.id,
    projectId: team.projectId,
    content: `[${agent.name}] ${content}`,
    status: 'executing',
    createdAt: new Date().toISOString(),
    acknowledgedAt: new Date().toISOString()
  };
  instructionsState.push(instruction);
  io.emit('instruction:created', instruction);

  addLog(team.id, agent.id, 'info', `Direct instruction to ${agent.name}: ${content.substring(0, 80)}`);
  dispatchSingleAgent(team, agent, content);

  res.json({ instruction, agent });
});

// ============================================================
// RESULTS
// ============================================================

app.get('/api/teams/:teamId/results', (req, res) => {
  const results = resultsState.filter(r => r.teamId === req.params.teamId);
  res.json({ results });
});

app.get('/api/agents/:agentId/result', (req, res) => {
  const result = resultsState.find(r => r.agentId === req.params.agentId);
  if (!result) return res.status(404).json({ error: 'No result yet' });
  res.json(result);
});

// Get agent output (live or completed)
app.get('/api/teams/:teamId/agents/:agentId/output', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });
  const agent = team.agents.find(a => a.id === req.params.agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({
    output: agent.output || '',
    filesChanged: agent.filesChanged || [],
    status: agent.status
  });
});

// ============================================================
// ORCHESTRATOR CHAT
// ============================================================

const chatHistories = new Map<string, ChatMessage[]>();

app.get('/api/teams/:teamId/chat', (req, res) => {
  const history = chatHistories.get(req.params.teamId) || [];
  res.json({ messages: history });
});

app.post('/api/teams/:teamId/chat', (req, res) => {
  const { message } = req.body;
  const teamId = req.params.teamId;
  const team = teamsState.get(teamId);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const project = team.projectId ? projectsState.get(team.projectId) : undefined;
  if (!project) return res.status(400).json({ error: 'No project assigned' });

  // Store user message
  if (!chatHistories.has(teamId)) chatHistories.set(teamId, []);
  const history = chatHistories.get(teamId)!;
  history.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

  // Build context for the orchestrator
  const teamInfo = team.agents.map(a => `- ${a.name} (${a.role}): ${a.status}, progress ${a.progress}%${a.currentTask ? `, task: ${a.currentTask}` : ''}`).join('\n');
  const recentResults = resultsState
    .filter(r => r.teamId === teamId)
    .slice(-3)
    .map(r => `Agent ${r.agentId}: ${r.filesChanged.length} files changed, exit ${r.exitCode}`)
    .join('\n');

  const conversationContext = history.slice(-10).map(m => `${m.role === 'user' ? 'User' : 'Orchestrator'}: ${m.content}`).join('\n\n');

  const prompt = `You are an orchestrator assistant for a development team. You help the user plan, manage, and direct their agent team.

Project: ${project.name} (${project.path})

Current team:
${teamInfo || '(no agents)'}

Recent results:
${recentResults || '(none yet)'}

Available actions you can suggest:
- Recommend adding/removing agents
- Suggest what instructions to give
- Analyze what the team has done so far
- Answer questions about the project
- Help plan next steps

IMPORTANT: If the user asks you to actually execute something (make changes, run agents, etc.), tell them what instruction to send via the Instructions panel, or what agent to direct. You are advisory — you plan and suggest, agents execute.

If the user asks you to "wait for instructions" or similar, acknowledge and explain what you've analyzed so far.

Conversation:
${conversationContext}

Respond concisely and helpfully.`;

  // Stream response via SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  console.log(`[chat] Spawning claude in ${project.path}, prompt length: ${prompt.length}`);

  const proc = spawn('claude', ['--print', '--model', 'sonnet'], {
    cwd: project.path,
    env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard-chat' },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  proc.stdin?.write(prompt);
  proc.stdin?.end();

  let fullResponse = '';
  let stderrOutput = '';

  proc.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    fullResponse += chunk;
    try {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    } catch { /* client may have disconnected */ }
  });

  proc.stderr?.on('data', (data: Buffer) => {
    stderrOutput += data.toString();
  });

  proc.on('close', (code) => {
    console.log(`[chat] claude exited with code ${code}, stdout: ${fullResponse.length} bytes, stderr: ${stderrOutput.length} bytes`);
    if (stderrOutput) console.log(`[chat] stderr: ${stderrOutput.substring(0, 500)}`);
    // Store assistant response
    if (fullResponse.trim()) {
      history.push({ role: 'assistant', content: fullResponse, timestamp: new Date().toISOString() });
      scheduleSave();
    }
    try {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch { /* already closed */ }
  });

  proc.on('error', (err) => {
    try {
      res.write(`data: ${JSON.stringify({ chunk: `Error: ${err.message}`, done: true })}\n\n`);
      res.end();
    } catch { /* already closed */ }
  });

  // Timeout after 120s
  const timeout = setTimeout(() => { try { proc.kill(); } catch {} }, 120000);
  proc.on('close', () => clearTimeout(timeout));
});

// ============================================================
// METRICS & LOGS
// ============================================================

app.get('/api/metrics/:teamId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  const teamResults = resultsState.filter(r => r.teamId === req.params.teamId);
  const totalFiles = teamResults.reduce((s, r) => s + r.filesChanged.length, 0);
  const completedAgents = team?.agents.filter(a => a.status === 'complete').length || 0;
  const failedAgents = team?.agents.filter(a => a.status === 'failed').length || 0;

  res.json({
    team: req.params.teamId,
    metrics: {
      agentsTotal: team?.agents.length || 0,
      agentsComplete: completedAgents,
      agentsFailed: failedAgents,
      agentsWorking: team?.agents.filter(a => a.status === 'working').length || 0,
      filesChanged: totalFiles,
      instructionsTotal: instructionsState.filter(i => i.teamId === req.params.teamId).length,
      instructionsDone: instructionsState.filter(i => i.teamId === req.params.teamId && i.status === 'done').length,
    },
    timeline: []
  });
});

app.get('/api/insights/:teamId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  const insights: { type: string; severity: string; message: string; action: string }[] = [];

  if (team) {
    const idle = team.agents.filter(a => a.status === 'idle');
    const failed = team.agents.filter(a => a.status === 'failed');
    const working = team.agents.filter(a => a.status === 'working');

    if (failed.length > 0) {
      insights.push({
        type: 'error', severity: 'high',
        message: `${failed.length} agent(s) failed: ${failed.map(a => a.name).join(', ')}`,
        action: 'Check agent output for errors and retry'
      });
    }
    if (idle.length > 0 && working.length > 0) {
      insights.push({
        type: 'optimization', severity: 'medium',
        message: `${idle.length} idle agent(s) while ${working.length} are working`,
        action: 'Send instructions to activate idle agents'
      });
    }
    if (!team.projectId) {
      insights.push({
        type: 'config', severity: 'high',
        message: 'No project assigned — agents cannot execute without a target directory',
        action: 'Assign a project in Team Control'
      });
    }
  }

  res.json({ insights });
});

app.get('/api/logs/:teamId', (req, res) => {
  const teamLogs = logsState.filter(l => l.teamId === req.params.teamId);
  res.json({ logs: teamLogs });
});

// ============================================================
// WEBSOCKET
// ============================================================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.emit('initial:state', {
    teams: Array.from(teamsState.values()),
    projects: Array.from(projectsState.values()),
    availableAgents,
    phases: Object.fromEntries(phasesState)
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============================================================
// START
// ============================================================

const PORT = process.env.PORT || 3001;

Promise.all([loadState(), scanAgents()]).then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Agent Dashboard API running on http://localhost:${PORT}`);
    console.log(`Available agents: ${availableAgents.length}`);
    console.log(`Projects: ${projectsState.size}, Teams: ${teamsState.size}`);
  });
});
