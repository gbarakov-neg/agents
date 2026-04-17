# Agent Control Dashboard: Building a UI for Agent Orchestration

Complete guide to building a custom web-based dashboard for monitoring and controlling agent teams during development cycles.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENT CONTROL DASHBOARD                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌──────────────────────┐  ┌──────────────────────┐                     │
│  │   Real-Time Status   │  │  Workflow Progress   │                     │
│  │  ├─ Team members     │  │  ├─ Phase timeline   │                     │
│  │  ├─ Agent state      │  │  ├─ Current phase    │                     │
│  │  ├─ Current tasks    │  │  └─ Next steps       │                     │
│  │  └─ Health metrics   │  └──────────────────────┘                     │
│  └──────────────────────┘                                               │
│                                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │               Task & Issue Management                            │   │
│  │  ├─ Backlog       ├─ In Progress   ├─ Blocked    ├─ Complete  │   │
│  │  │ Feature 1      │ Feature 2      │ Feature 3   │ Feature 4  │   │
│  │  │                │                │             │            │   │
│  │  └────────────────└────────────────└─────────────└────────────┘   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                           │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │   Metrics View   │  │  Logs & Events   │  │  Agent Control   │      │
│  │  ├─ Velocity     │  │  ├─ Real-time    │  │  ├─ Spawn team   │      │
│  │  ├─ Quality      │  │  │   logs         │  │  ├─ Pause/Resume │      │
│  │  ├─ Performance  │  │  ├─ Errors       │  │  ├─ Reassign     │      │
│  │  └─ Coverage     │  │  └─ Alerts       │  │  └─ Shutdown     │      │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
         │                        │                      │
         ▼                        ▼                      ▼
    ┌─────────────┐    ┌──────────────────┐    ┌────────────────┐
    │  Agent API  │    │  WebSocket Feed  │    │ Claude Code    │
    │  Endpoints  │◄──►│  (Real-time      │◄──►│ Integration    │
    └─────────────┘    │   updates)       │    │ (Agent Teams)  │
                       └──────────────────┘    └────────────────┘
```

---

## Option 1: Lightweight Dashboard (Recommended for Quick Start)

### 1.1 Tech Stack

```
Frontend:
├─ React 18 + TypeScript
├─ TailwindCSS (styling)
├─ WebSocket (real-time updates)
├─ Recharts (metrics visualization)
├─ React Query (state management)
└─ React Flow (workflow visualization)

Backend:
├─ Node.js/Express or Python/FastAPI
├─ WebSocket server
├─ File-based or SQLite state tracking
└─ Integration with Claude Code API
```

### 1.2 Quick Start Implementation

Create the project structure:

```bash
mkdir agent-dashboard
cd agent-dashboard

# Frontend
npx create-react-app frontend --template typescript
cd frontend
npm install -D tailwindcss postcss autoprefixer
npm install recharts react-flow-renderer axios socket.io-client react-query
npx tailwindcss init -p

# Backend
cd ..
mkdir backend
cd backend
npm init -y
npm install express cors socket.io dotenv axios
```

---

## Implementation: Backend API

### 2.1 Express Server with WebSocket (`backend/server.ts`)

```typescript
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
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
// STATE MANAGEMENT
// ============================================================

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'complete';
  currentTask?: string;
  progress: number; // 0-100
  model: string;
}

interface Team {
  id: string;
  name: string;
  phase: string;
  status: 'planning' | 'active' | 'paused' | 'complete';
  agents: Agent[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

interface WorkflowPhase {
  name: string;
  description: string;
  status: 'pending' | 'in-progress' | 'complete' | 'blocked';
  agents: string[];
  startTime?: Date;
  endTime?: Date;
  estimatedDuration: number; // minutes
}

const teamsState = new Map<string, Team>();
const phasesState = new Map<string, WorkflowPhase[]>();

// ============================================================
// REST ENDPOINTS
// ============================================================

// Get all active teams
app.get('/api/teams', (req, res) => {
  const teams = Array.from(teamsState.values());
  res.json({ teams, count: teams.length });
});

// Get team details
app.get('/api/teams/:teamId', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }
  res.json(team);
});

// Create new team
app.post('/api/teams', (req, res) => {
  const { name, type, agents } = req.body;
  const teamId = `team-${Date.now()}`;
  
  const newTeam: Team = {
    id: teamId,
    name,
    phase: 'planning',
    status: 'active',
    agents: agents.map((agent: any) => ({
      id: `agent-${Math.random().toString(36).substr(2, 9)}`,
      name: agent.name,
      role: agent.role,
      status: 'idle',
      progress: 0,
      model: agent.model
    })),
    createdAt: new Date(),
    startedAt: new Date()
  };

  teamsState.set(teamId, newTeam);
  
  // Broadcast to all connected clients
  io.emit('team:created', newTeam);
  
  res.json(newTeam);
});

// Update agent status
app.patch('/api/teams/:teamId/agents/:agentId', (req, res) => {
  const { teamId, agentId } = req.params;
  const { status, progress, currentTask } = req.body;

  const team = teamsState.get(teamId);
  if (!team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  const agent = team.agents.find(a => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  Object.assign(agent, { status, progress, currentTask });

  // Broadcast update
  io.emit('agent:updated', { teamId, agent });

  res.json(agent);
});

// Get workflow phases
app.get('/api/teams/:teamId/phases', (req, res) => {
  const phases = phasesState.get(req.params.teamId) || [];
  res.json({ phases });
});

// Update phase status
app.patch('/api/teams/:teamId/phases/:phaseId', (req, res) => {
  const { teamId, phaseId } = req.params;
  const { status } = req.body;

  const phases = phasesState.get(teamId) || [];
  const phase = phases.find((p, i) => i.toString() === phaseId);

  if (!phase) {
    return res.status(404).json({ error: 'Phase not found' });
  }

  phase.status = status;
  if (status === 'in-progress') phase.startTime = new Date();
  if (status === 'complete') phase.endTime = new Date();

  phasesState.set(teamId, phases);
  
  io.emit('phase:updated', { teamId, phase });

  res.json(phase);
});

// Team control endpoints
app.post('/api/teams/:teamId/pause', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'paused';
    io.emit('team:paused', { teamId: team.id });
  }
  res.json(team);
});

app.post('/api/teams/:teamId/resume', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'active';
    io.emit('team:resumed', { teamId: team.id });
  }
  res.json(team);
});

app.post('/api/teams/:teamId/shutdown', (req, res) => {
  const team = teamsState.get(req.params.teamId);
  if (team) {
    team.status = 'complete';
    team.completedAt = new Date();
    io.emit('team:shutdown', { teamId: team.id });
  }
  res.json(team);
});

// ============================================================
// WEBSOCKET EVENTS
// ============================================================

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  socket.emit('initial:state', {
    teams: Array.from(teamsState.values()),
    phases: Object.fromEntries(phasesState)
  });

  socket.on('agent:progress', (data) => {
    const { teamId, agentId, progress, message } = data;
    const team = teamsState.get(teamId);
    
    if (team) {
      const agent = team.agents.find(a => a.id === agentId);
      if (agent) {
        agent.progress = progress;
        io.emit('agent:progress', { teamId, agentId, progress, message });
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

---

## Implementation: Frontend Dashboard

### 3.1 Main Dashboard Component (`frontend/src/Dashboard.tsx`)

```typescript
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import TeamMonitor from './components/TeamMonitor';
import WorkflowTimeline from './components/WorkflowTimeline';
import MetricsPanel from './components/MetricsPanel';
import ControlPanel from './components/ControlPanel';

interface Team {
  id: string;
  name: string;
  status: 'planning' | 'active' | 'paused' | 'complete';
  agents: Agent[];
  phase: string;
  startedAt?: Date;
}

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'complete';
  progress: number;
  currentTask?: string;
}

const socket = io('http://localhost:3001');

export default function Dashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Initial state
    socket.on('initial:state', (state) => {
      setTeams(state.teams);
      if (state.teams.length > 0) {
        setSelectedTeam(state.teams[0]);
      }
      setIsLoading(false);
    });

    // Real-time updates
    socket.on('team:created', (team) => {
      setTeams(prev => [...prev, team]);
      setSelectedTeam(team);
    });

    socket.on('team:paused', ({ teamId }) => {
      setTeams(prev => prev.map(t => 
        t.id === teamId ? { ...t, status: 'paused' } : t
      ));
    });

    socket.on('team:resumed', ({ teamId }) => {
      setTeams(prev => prev.map(t => 
        t.id === teamId ? { ...t, status: 'active' } : t
      ));
    });

    socket.on('agent:updated', ({ teamId, agent }) => {
      setTeams(prev => prev.map(t => 
        t.id === teamId 
          ? {
              ...t,
              agents: t.agents.map(a => a.id === agent.id ? agent : a)
            }
          : t
      ));
      
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(prev => prev ? {
          ...prev,
          agents: prev.agents.map(a => a.id === agent.id ? agent : a)
        } : null);
      }
    });

    return () => {
      socket.off('initial:state');
      socket.off('team:created');
      socket.off('team:paused');
      socket.off('team:resumed');
      socket.off('agent:updated');
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-2xl">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-800 p-6">
        <h1 className="text-3xl font-bold">Agent Control Dashboard</h1>
        <p className="text-gray-400 mt-2">
          Monitor and control {teams.length} active team{teams.length !== 1 ? 's' : ''}
        </p>
      </header>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-6 p-6">
        
        {/* Left Sidebar: Team List */}
        <div className="col-span-3">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <h2 className="text-xl font-bold mb-4">Active Teams</h2>
            <div className="space-y-2">
              {teams.map(team => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeam(team)}
                  className={`w-full text-left p-3 rounded-lg transition ${
                    selectedTeam?.id === team.id
                      ? 'bg-blue-600'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="font-semibold">{team.name}</div>
                  <div className="text-sm text-gray-300">
                    {team.agents.length} agents
                  </div>
                  <div className={`text-xs mt-1 ${
                    team.status === 'active' ? 'text-green-400' :
                    team.status === 'paused' ? 'text-yellow-400' :
                    team.status === 'complete' ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {team.status.toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Content: Details */}
        <div className="col-span-9 space-y-6">
          
          {selectedTeam ? (
            <>
              {/* Team Monitor */}
              <TeamMonitor team={selectedTeam} />
              
              {/* Workflow Timeline */}
              <WorkflowTimeline teamId={selectedTeam.id} />
              
              {/* Control Panel */}
              <ControlPanel team={selectedTeam} />
              
              {/* Metrics */}
              <MetricsPanel teamId={selectedTeam.id} />
            </>
          ) : (
            <div className="bg-gray-800 rounded-lg p-12 text-center text-gray-400">
              <p>Select a team to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### 3.2 Team Monitor Component (`frontend/src/components/TeamMonitor.tsx`)

```typescript
import React from 'react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'idle' | 'working' | 'blocked' | 'complete';
  progress: number;
  currentTask?: string;
  model: string;
}

interface Team {
  id: string;
  name: string;
  agents: Agent[];
  status: string;
}

export default function TeamMonitor({ team }: { team: Team }) {
  const statusColors = {
    idle: 'bg-gray-600',
    working: 'bg-blue-600',
    blocked: 'bg-red-600',
    complete: 'bg-green-600'
  };

  const statusIcons = {
    idle: '⏸️',
    working: '⚙️',
    blocked: '🚫',
    complete: '✅'
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-2xl font-bold mb-6">Team Members</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {team.agents.map(agent => (
          <div
            key={agent.id}
            className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-blue-500 transition"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold text-lg">{agent.name}</div>
                <div className="text-sm text-gray-400">{agent.role}</div>
              </div>
              <div className="text-2xl">
                {statusIcons[agent.status as keyof typeof statusIcons]}
              </div>
            </div>

            {/* Status Badge */}
            <div className="mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                statusColors[agent.status as keyof typeof statusColors]
              }`}>
                {agent.status.toUpperCase()}
              </span>
            </div>

            {/* Current Task */}
            {agent.currentTask && (
              <div className="mb-3">
                <div className="text-xs text-gray-400 mb-1">Current Task</div>
                <div className="text-sm text-gray-200 truncate">
                  {agent.currentTask}
                </div>
              </div>
            )}

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-400">Progress</span>
                <span className="text-xs font-semibold text-gray-300">
                  {agent.progress}%
                </span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${agent.progress}%` }}
                />
              </div>
            </div>

            {/* Model Info */}
            <div className="text-xs text-gray-500">
              Model: {agent.model}
            </div>
          </div>
        ))}
      </div>

      {/* Overall Progress */}
      <div className="mt-6 pt-6 border-t border-gray-600">
        <div className="text-sm text-gray-400 mb-2">Team Progress</div>
        <div className="w-full bg-gray-600 rounded-full h-3">
          <div
            className="bg-green-500 h-3 rounded-full transition-all duration-300"
            style={{
              width: `${
                team.agents.length > 0
                  ? Math.round(
                      team.agents.reduce((sum, a) => sum + a.progress, 0) /
                      team.agents.length
                    )
                  : 0
              }%`
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

### 3.3 Control Panel Component (`frontend/src/components/ControlPanel.tsx`)

```typescript
import React from 'react';
import axios from 'axios';

interface Team {
  id: string;
  name: string;
  status: 'planning' | 'active' | 'paused' | 'complete';
}

export default function ControlPanel({ team }: { team: Team }) {
  const handlePause = async () => {
    try {
      await axios.post(`http://localhost:3001/api/teams/${team.id}/pause`);
    } catch (error) {
      console.error('Failed to pause team:', error);
    }
  };

  const handleResume = async () => {
    try {
      await axios.post(`http://localhost:3001/api/teams/${team.id}/resume`);
    } catch (error) {
      console.error('Failed to resume team:', error);
    }
  };

  const handleShutdown = async () => {
    if (window.confirm('Are you sure you want to shut down this team?')) {
      try {
        await axios.post(`http://localhost:3001/api/teams/${team.id}/shutdown`);
      } catch (error) {
        console.error('Failed to shutdown team:', error);
      }
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4">Team Control</h2>
      
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={handlePause}
          disabled={team.status !== 'active'}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
        >
          ⏸️ Pause Team
        </button>

        <button
          onClick={handleResume}
          disabled={team.status !== 'paused'}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
        >
          ▶️ Resume Team
        </button>

        <button
          onClick={handleShutdown}
          disabled={team.status === 'complete'}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition"
        >
          🛑 Shutdown Team
        </button>
      </div>

      {/* Team Status Info */}
      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-xs">Status</div>
            <div className="text-lg font-bold text-white">
              {team.status.toUpperCase()}
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Phase</div>
            <div className="text-lg font-bold text-white">
              Implementation
            </div>
          </div>
          <div>
            <div className="text-gray-400 text-xs">Duration</div>
            <div className="text-lg font-bold text-white">
              2h 45m
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 3.4 Workflow Timeline Component (`frontend/src/components/WorkflowTimeline.tsx`)

```typescript
import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Phase {
  name: string;
  status: 'pending' | 'in-progress' | 'complete' | 'blocked';
  agents: string[];
  estimatedDuration: number;
  startTime?: Date;
  endTime?: Date;
}

export default function WorkflowTimeline({ teamId }: { teamId: string }) {
  const [phases, setPhases] = useState<Phase[]>([]);

  useEffect(() => {
    fetchPhases();
  }, [teamId]);

  const fetchPhases = async () => {
    try {
      const response = await axios.get(
        `http://localhost:3001/api/teams/${teamId}/phases`
      );
      setPhases(response.data.phases);
    } catch (error) {
      console.error('Failed to fetch phases:', error);
    }
  };

  const statusColors = {
    pending: 'bg-gray-600',
    'in-progress': 'bg-blue-600',
    complete: 'bg-green-600',
    blocked: 'bg-red-600'
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-6">Workflow Timeline</h2>
      
      <div className="space-y-4">
        {phases.map((phase, index) => (
          <div key={index} className="flex items-start gap-4">
            {/* Timeline Node */}
            <div className="flex flex-col items-center">
              <div className={`w-4 h-4 rounded-full ${
                statusColors[phase.status as keyof typeof statusColors]
              } mb-2`} />
              {index < phases.length - 1 && (
                <div className="w-1 h-16 bg-gray-600" />
              )}
            </div>

            {/* Phase Details */}
            <div className="flex-1">
              <div className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg">{phase.name}</h3>
                  <span className={`px-3 py-1 rounded text-xs font-semibold ${
                    statusColors[phase.status as keyof typeof statusColors]
                  }`}>
                    {phase.status.toUpperCase()}
                  </span>
                </div>
                
                <div className="text-sm text-gray-400 mb-2">
                  Est. Duration: {phase.estimatedDuration} min
                </div>
                
                {phase.agents.length > 0 && (
                  <div className="text-sm">
                    <span className="text-gray-400">Agents: </span>
                    <span className="text-gray-200">
                      {phase.agents.join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Option 2: Advanced Dashboard with Real-time Analytics

For production deployments with more sophisticated monitoring:

### 4.1 Additional Features

```typescript
// Add to backend/server.ts

// Advanced analytics endpoint
app.get('/api/metrics/:teamId', (req, res) => {
  const teamId = req.params.teamId;
  
  res.json({
    team: teamId,
    metrics: {
      // Development velocity
      featuresCompleted: 3,
      featuresInProgress: 2,
      featureBlocked: 1,
      cycleTime: 2.5, // hours
      throughput: 1.2, // features per day
      
      // Quality metrics
      testCoverage: 87.5,
      bugRate: 0.3, // bugs per feature
      securityVulnerabilities: 0,
      
      // Performance metrics
      apiLatencyP99: 125, // ms
      deploymentFrequency: 5, // per day
      meanTimeToRecovery: 15, // minutes
      
      // Team metrics
      avgResponseTime: 8, // minutes
      collaboration: 94, // %
      codeReviewTurnaround: 2, // hours
    },
    timeline: [
      { timestamp: Date.now() - 3600000, velocity: 1.0 },
      { timestamp: Date.now() - 1800000, velocity: 1.1 },
      { timestamp: Date.now(), velocity: 1.2 }
    ]
  });
});

// Insights endpoint
app.get('/api/insights/:teamId', (req, res) => {
  res.json({
    insights: [
      {
        type: 'bottleneck',
        severity: 'high',
        message: 'Database agent is blocking 2 features',
        action: 'Spawn additional database team'
      },
      {
        type: 'quality',
        severity: 'medium',
        message: 'Test coverage dropped 5% this sprint',
        action: 'Review test generation strategy'
      },
      {
        type: 'performance',
        severity: 'low',
        message: 'API latency trending up 10%',
        action: 'Consider caching optimization'
      }
    ]
  });
});
```

### 4.2 Metrics Dashboard Component

```typescript
// frontend/src/components/MetricsPanel.tsx

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function MetricsPanel({ teamId }: { teamId: string }) {
  const [metrics, setMetrics] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [teamId]);

  const fetchMetrics = async () => {
    try {
      const [metricsRes, insightsRes] = await Promise.all([
        axios.get(`http://localhost:3001/api/metrics/${teamId}`),
        axios.get(`http://localhost:3001/api/insights/${teamId}`)
      ]);
      setMetrics(metricsRes.data);
      setInsights(insightsRes.data.insights);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard 
          label="Cycle Time"
          value={`${metrics.metrics.cycleTime}h`}
          change="-15%"
          positive
        />
        <MetricCard
          label="Test Coverage"
          value={`${metrics.metrics.testCoverage}%`}
          change="+5%"
          positive
        />
        <MetricCard
          label="Bugs Found"
          value={metrics.metrics.bugRate}
          change="-10%"
          positive
        />
        <MetricCard
          label="Deployments/Day"
          value={metrics.metrics.deploymentFrequency}
          change="+25%"
          positive
        />
      </div>

      {/* Velocity Chart */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-bold mb-4">Throughput Trend</h3>
        <LineChart width={800} height={300} data={metrics.timeline}>
          <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
          <XAxis dataKey="timestamp" stroke="#888" />
          <YAxis stroke="#888" />
          <Tooltip />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="velocity" 
            stroke="#3b82f6"
            strokeWidth={2}
          />
        </LineChart>
      </div>

      {/* Insights */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-xl font-bold mb-4">AI Insights</h3>
        <div className="space-y-3">
          {insights.map((insight, idx) => (
            <div key={idx} className={`p-4 rounded-lg border ${
              insight.severity === 'high' ? 'bg-red-900/20 border-red-700' :
              insight.severity === 'medium' ? 'bg-yellow-900/20 border-yellow-700' :
              'bg-blue-900/20 border-blue-700'
            }`}>
              <div className="font-semibold">{insight.message}</div>
              <div className="text-sm text-gray-400 mt-1">
                Recommended: {insight.action}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, change, positive }: any) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="text-gray-400 text-sm mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className={`text-xs mt-2 ${positive ? 'text-green-400' : 'text-red-400'}`}>
        {change}
      </div>
    </div>
  );
}
```

---

## Step-by-Step Setup

### 5.1 Start Backend

```bash
cd backend
npm install
npm start

# Output: Server running on http://localhost:3001
```

### 5.2 Start Frontend

```bash
cd frontend
npm start

# Output: Starts on http://localhost:3000
```

### 5.3 Integration with Claude Code

In Claude Code, your agents can now post progress:

```bash
# Agent publishes progress via dashboard API
curl -X PATCH http://localhost:3001/api/teams/team-xyz/agents/agent-123 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "working",
    "progress": 45,
    "currentTask": "Implementing checkout API endpoints"
  }'
```

---

## Integration with Self-Improving Cycle

Update the orchestration to emit events:

```bash
# In Claude Code, have agents emit events to dashboard:

export DASHBOARD_URL="http://localhost:3001"

# Start team with dashboard integration
/team-spawn "feature-dev" --dashboard $DASHBOARD_URL --emit-events

# Each agent will automatically:
# - Report progress
# - Stream logs
# - Update status
# - Publish metrics
```

---

## Advanced Patterns

### 6.1 Triggering Agent Actions from Dashboard

```typescript
// frontend button click
const handleReprioritizeWork = async () => {
  await axios.post(`/api/teams/${teamId}/command`, {
    command: 'reprioritize',
    agents: ['backend-developer'],
    newPriority: 'high'
  });
};

// Backend receives and forwards to Claude Code
app.post('/api/teams/:teamId/command', (req, res) => {
  const { command, agents, newPriority } = req.body;
  
  // Emit to Claude Code via webhook
  axios.post(process.env.CLAUDE_CODE_WEBHOOK, {
    teamId: req.params.teamId,
    command,
    agents,
    newPriority
  });

  res.json({ received: true });
});
```

### 6.2 Persistent State Storage

```bash
# Use SQLite for durability
npm install sqlite sqlite3

# Or PostgreSQL for production
npm install pg
```

### 6.3 Historical Analysis

Track metrics over weeks/months:

```typescript
// Analyze velocity trends
const velocityTrend = await db.query(`
  SELECT date, velocity, deployment_frequency, bug_rate
  FROM metrics
  WHERE team_id = ?
  ORDER BY date DESC
  LIMIT 30
`);

// Forecast when features will complete
const forecast = predictCompletion(velocityTrend);
```

---

## Deployment Options

### Option A: Local Development
- Backend: Node.js on localhost:3001
- Frontend: React dev server on localhost:3000
- State: In-memory (resets on restart)

### Option B: Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      PORT: 3001
    volumes:
      - ./data:/app/data

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:3001

  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Run with:
```bash
docker-compose up
```

### Option C: Cloud Deployment (Vercel + Railway)

```bash
# Frontend to Vercel
cd frontend && vercel deploy

# Backend to Railway
cd backend && railway up
```

---

## Next Steps

1. **Start with lightweight version** (Section 1-3)
2. **Add WebSocket integration** (Section 2)
3. **Build UI components** (Section 3)
4. **Connect to Claude Code** (Integration section)
5. **Add advanced analytics** (Section 4)
6. **Deploy to production** (Deployment section)

Your fully-featured Agent Control Dashboard is now ready! 🚀
