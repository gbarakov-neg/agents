import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Team, Agent, Project, AvailableAgent } from './types';
import TeamMonitor from './components/TeamMonitor';
import WorkflowTimeline from './components/WorkflowTimeline';
import MetricsPanel from './components/MetricsPanel';
import ControlPanel from './components/ControlPanel';
import LogsPanel from './components/LogsPanel';
import ProjectSelector from './components/ProjectSelector';
import InstructionsPanel from './components/InstructionsPanel';
import CreateTeamModal from './components/CreateTeamModal';
import OrchestratorChat from './components/OrchestratorChat';

const socket: Socket = io('http://localhost:3001');

export default function Dashboard() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<AvailableAgent[]>([]);
  const [connected, setConnected] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('initial:state', (state: { teams: Team[]; projects: Project[]; availableAgents?: AvailableAgent[] }) => {
      setTeams(state.teams);
      setProjects(state.projects || []);
      if (state.availableAgents) setAvailableAgents(state.availableAgents);
      if (state.teams.length > 0 && !selectedTeamId) {
        setSelectedTeamId(state.teams[0].id);
      }
    });

    socket.on('team:created', (team: Team) => {
      setTeams(prev => [...prev, team]);
    });

    socket.on('team:updated', (team: Team) => {
      setTeams(prev => prev.map(t => t.id === team.id ? team : t));
    });

    socket.on('agent:updated', ({ teamId, agent }: { teamId: string; agent: Agent }) => {
      setTeams(prev => prev.map(t =>
        t.id === teamId
          ? { ...t, agents: t.agents.map(a => a.id === agent.id ? agent : a) }
          : t
      ));
    });

    socket.on('project:created', (project: Project) => {
      setProjects(prev => [...prev, project]);
    });

    socket.on('project:deleted', ({ projectId }: { projectId: string }) => {
      setProjects(prev => prev.filter(p => p.id !== projectId));
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('initial:state');
      socket.off('team:created');
      socket.off('team:updated');
      socket.off('agent:updated');
      socket.off('project:created');
      socket.off('project:deleted');
    };
  }, []);

  const selectedTeam = teams.find(t => t.id === selectedTeamId) || null;

  const selectedProject = selectedTeam?.projectId
    ? projects.find(p => p.id === selectedTeam.projectId)
    : undefined;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-700 bg-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold">Agent Control Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              {teams.length} team{teams.length !== 1 ? 's' : ''} &middot;{' '}
              {teams.reduce((sum, t) => sum + t.agents.length, 0)} agents
            </p>
          </div>

          {/* Project Selector in header */}
          <ProjectSelector
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelect={(id) => setSelectedProjectId(id)}
            onAddProject={(project) => setProjects(prev => [...prev, project])}
          />
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className="text-sm text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Left Sidebar */}
        <aside className="w-72 border-r border-gray-700 bg-gray-800/50 p-4 overflow-y-auto flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              All Teams
              <span className="ml-1 text-gray-600 normal-case font-normal">
                ({teams.length})
              </span>
            </h2>
            <button
              onClick={() => setShowCreateTeam(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg font-medium transition-colors"
            >
              + New
            </button>
          </div>

          {teams.length === 0 ? (
            <p className="text-xs text-gray-500 py-4 text-center">
              No teams yet.{' '}
              <button onClick={() => setShowCreateTeam(true)} className="text-blue-400 hover:underline">
                Create one
              </button>
            </p>
          ) : (
            <div className="space-y-4">
              {/* Group teams by project */}
              {(() => {
                const grouped: Record<string, typeof teams> = {};
                const unassigned: typeof teams = [];
                for (const t of teams) {
                  if (t.projectId) {
                    if (!grouped[t.projectId]) grouped[t.projectId] = [];
                    grouped[t.projectId].push(t);
                  } else {
                    unassigned.push(t);
                  }
                }

                const sections: { label: string; projectId: string | null; teams: typeof teams }[] = [];
                for (const [pid, pTeams] of Object.entries(grouped)) {
                  const proj = projects.find(p => p.id === pid);
                  sections.push({ label: proj?.name || 'Unknown Project', projectId: pid, teams: pTeams });
                }
                if (unassigned.length > 0) {
                  sections.push({ label: 'No Project', projectId: null, teams: unassigned });
                }

                return sections.map(section => (
                  <div key={section.projectId || 'none'}>
                    <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 px-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60 flex-shrink-0" />
                      {section.label}
                      <span className="text-gray-600">({section.teams.length})</span>
                    </div>
                    <div className="space-y-1.5">
                      {section.teams.map(team => {
                        const workingCount = team.agents.filter(a => a.status === 'working').length;
                        const avgProgress = team.agents.length > 0
                          ? Math.round(team.agents.reduce((s, a) => s + a.progress, 0) / team.agents.length)
                          : 0;
                        return (
                          <button
                            key={team.id}
                            onClick={() => setSelectedTeamId(team.id)}
                            className={`w-full text-left p-2.5 rounded-lg transition-colors ${
                              selectedTeamId === team.id
                                ? 'bg-blue-600/30 border border-blue-500'
                                : 'bg-gray-700/50 border border-transparent hover:bg-gray-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-sm truncate">{team.name}</div>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                team.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                team.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                                team.status === 'complete' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-gray-500/20 text-gray-400'
                              }`}>
                                {team.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-[10px] text-gray-400">
                                {team.agents.length} agent{team.agents.length !== 1 ? 's' : ''}
                                {workingCount > 0 && (
                                  <span className="text-blue-400 ml-1">({workingCount} working)</span>
                                )}
                              </span>
                              {avgProgress > 0 && (
                                <span className="text-[10px] text-gray-500">{avgProgress}%</span>
                              )}
                            </div>
                            {/* Mini progress bar */}
                            <div className="w-full bg-gray-600 rounded-full h-1 mt-1.5">
                              <div
                                className={`h-1 rounded-full transition-all ${
                                  team.agents.some(a => a.status === 'failed') ? 'bg-red-500' :
                                  avgProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${avgProgress}%` }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedTeam ? (
            <>
              {/* Project badge */}
              {selectedProject && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Project:</span>
                  <span className="bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded-md font-medium">
                    {selectedProject.name}
                  </span>
                  <span className="text-gray-600 text-xs font-mono">{selectedProject.path}</span>
                </div>
              )}

              {/* Instructions — prominent, full-width */}
              <InstructionsPanel teamId={selectedTeam.id} teamName={selectedTeam.name} />

              <TeamMonitor team={selectedTeam} />

              <div className="grid grid-cols-2 gap-6">
                <WorkflowTimeline teamId={selectedTeam.id} team={selectedTeam} />
                <div className="space-y-6">
                  <ControlPanel team={selectedTeam} projects={projects} />
                  <LogsPanel teamId={selectedTeam.id} />
                </div>
              </div>
              <MetricsPanel teamId={selectedTeam.id} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              Select a team to view details
            </div>
          )}
        </main>
      </div>

      {/* Create Team Modal */}
      {showCreateTeam && (
        <CreateTeamModal
          projects={projects}
          availableAgents={availableAgents}
          defaultProjectId={selectedProjectId}
          onClose={() => setShowCreateTeam(false)}
          onCreated={(teamId) => setSelectedTeamId(teamId)}
        />
      )}

      {/* Orchestrator Chat */}
      {selectedTeam && (
        <OrchestratorChat teamId={selectedTeam.id} teamName={selectedTeam.name} />
      )}
    </div>
  );
}
