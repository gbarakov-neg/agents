import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { WorkflowPhase, Team } from '../types';

const API = 'http://localhost:3001';
const socket = io(API);

const statusColors: Record<string, string> = {
  pending: 'bg-gray-500',
  'in-progress': 'bg-blue-500',
  complete: 'bg-green-500',
  blocked: 'bg-red-500'
};

const statusBorder: Record<string, string> = {
  pending: 'border-gray-600',
  'in-progress': 'border-blue-500',
  complete: 'border-green-500',
  blocked: 'border-red-500'
};

// Map agent status to a phase-like view
function agentPhases(team: Team): WorkflowPhase[] {
  const phases: WorkflowPhase[] = [];
  const idle = team.agents.filter(a => a.status === 'idle');
  const working = team.agents.filter(a => a.status === 'working');
  const complete = team.agents.filter(a => a.status === 'complete');
  const failed = team.agents.filter(a => a.status === 'failed');

  if (complete.length > 0) {
    phases.push({
      name: 'Completed',
      description: complete.map(a => a.name).join(', '),
      status: 'complete',
      agents: complete.map(a => a.name),
      estimatedDuration: 0,
    });
  }
  if (working.length > 0) {
    phases.push({
      name: 'In Progress',
      description: working.map(a => `${a.name} (${a.progress}%)`).join(', '),
      status: 'in-progress',
      agents: working.map(a => a.name),
      estimatedDuration: 0,
    });
  }
  if (failed.length > 0) {
    phases.push({
      name: 'Failed',
      description: failed.map(a => a.name).join(', '),
      status: 'blocked',
      agents: failed.map(a => a.name),
      estimatedDuration: 0,
    });
  }
  if (idle.length > 0) {
    phases.push({
      name: 'Waiting',
      description: idle.map(a => a.name).join(', '),
      status: 'pending',
      agents: idle.map(a => a.name),
      estimatedDuration: 0,
    });
  }
  return phases;
}

export default function WorkflowTimeline({ teamId, team }: { teamId: string; team: Team }) {
  const [phases, setPhases] = useState<WorkflowPhase[]>([]);

  // Fetch orchestrated phases
  useEffect(() => {
    fetch(`${API}/api/teams/${teamId}/phases`)
      .then(r => r.json())
      .then(data => setPhases(data.phases || []))
      .catch(() => {});
  }, [teamId]);

  // Listen for phase updates
  useEffect(() => {
    const handler = ({ teamId: tid, phase, index }: { teamId: string; phase: WorkflowPhase; index: number }) => {
      if (tid === teamId) {
        setPhases(prev => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = phase;
          }
          return updated;
        });
      }
    };
    socket.on('phase:updated', handler);
    return () => { socket.off('phase:updated', handler); };
  }, [teamId]);

  // Use orchestrated phases if available, otherwise show agent-based summary
  const displayPhases = phases.length > 0 ? phases : agentPhases(team);
  const isOrchestrated = phases.length > 0;

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">
          {isOrchestrated ? 'Workflow Timeline' : 'Agent Activity'}
        </h2>
        {isOrchestrated && (
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
            orchestrated
          </span>
        )}
      </div>

      {displayPhases.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-4">
          No activity yet. Send instructions to get started.
        </p>
      ) : (
        <div className="space-y-1">
          {displayPhases.map((phase, i) => (
            <div key={i} className="flex gap-3">
              {/* Timeline line + dot */}
              <div className="flex flex-col items-center w-4 flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${statusColors[phase.status] || 'bg-gray-500'} flex-shrink-0 mt-1.5 ${
                  phase.status === 'in-progress' ? 'animate-pulse' : ''
                }`} />
                {i < displayPhases.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[2rem] ${
                    phase.status === 'complete' ? 'bg-green-500/40' : 'bg-gray-600'
                  }`} />
                )}
              </div>

              {/* Phase card */}
              <div className={`flex-1 mb-3 p-3 rounded-lg border bg-gray-700/40 ${statusBorder[phase.status] || 'border-gray-600'}`}>
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-sm">{phase.name}</h3>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    phase.status === 'complete' ? 'bg-green-500/20 text-green-300' :
                    phase.status === 'in-progress' ? 'bg-blue-500/20 text-blue-300' :
                    phase.status === 'blocked' ? 'bg-red-500/20 text-red-300' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>
                    {phase.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mb-1">{phase.description}</p>
                {isOrchestrated && (
                  <div className="flex justify-between text-xs text-gray-500">
                    {phase.estimatedDuration > 0 && <span>~{phase.estimatedDuration}m</span>}
                    <span>{phase.agents.join(', ')}</span>
                  </div>
                )}
                {phase.startTime && (
                  <div className="text-[10px] text-gray-600 mt-1">
                    Started {new Date(phase.startTime).toLocaleTimeString()}
                    {phase.endTime && <> — Ended {new Date(phase.endTime).toLocaleTimeString()}</>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
