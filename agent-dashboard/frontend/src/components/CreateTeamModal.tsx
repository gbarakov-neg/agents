import { useState, useMemo } from 'react';
import { Project, AvailableAgent } from '../types';

const API = 'http://localhost:3001';

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku' },
];

interface AgentDraft {
  name: string;
  role: string;
  model: string;
  plugin: string;
}

interface Props {
  projects: Project[];
  availableAgents: AvailableAgent[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreated: (teamId: string) => void;
}

export default function CreateTeamModal({ projects, availableAgents, defaultProjectId, onClose, onCreated }: Props) {
  const [teamName, setTeamName] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [agents, setAgents] = useState<AgentDraft[]>([]);
  const [instructions, setInstructions] = useState('');
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // Group available agents by plugin
  const groupedAgents = useMemo(() => {
    const groups: Record<string, AvailableAgent[]> = {};
    for (const a of availableAgents) {
      if (!groups[a.plugin]) groups[a.plugin] = [];
      groups[a.plugin].push(a);
    }
    return groups;
  }, [availableAgents]);

  // Filter by search
  const filteredAgents = useMemo(() => {
    if (!search.trim()) return availableAgents;
    const q = search.toLowerCase();
    return availableAgents.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.plugin.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q)
    );
  }, [availableAgents, search]);

  const addAgent = (a: AvailableAgent) => {
    const displayName = a.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const model = a.model === 'opus' ? 'claude-opus-4-6'
      : a.model === 'haiku' ? 'claude-haiku-4-5-20251001'
      : 'claude-sonnet-4-6';
    setAgents(prev => [...prev, { name: displayName, role: a.name, model, plugin: a.plugin }]);
  };

  const removeAgent = (idx: number) => {
    setAgents(prev => prev.filter((_, i) => i !== idx));
  };

  const updateAgent = (idx: number, field: keyof AgentDraft, value: string) => {
    setAgents(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const handleCreate = async () => {
    if (!teamName.trim() || agents.length === 0) return;
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamName.trim(),
          projectId: projectId || undefined,
          agents,
          instructions: instructions.trim() || undefined,
        })
      });
      const team = await res.json();
      onCreated(team.id);
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold">Create New Team</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
          </div>

          {/* Team name + project */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Team Name</label>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="e.g. Feature: Auth System"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Target Project / Repo</label>
              <select
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select a project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {p.path}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected agents */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-2">Selected Agents ({agents.length})</label>
            {agents.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {agents.map((agent, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-gray-700/50 rounded-lg p-2 border border-gray-600/50">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{agent.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{agent.plugin}</span>
                    </div>
                    <select
                      value={agent.model}
                      onChange={e => updateAgent(idx, 'model', e.target.value)}
                      className="w-28 bg-gray-600 border border-gray-500 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                    >
                      {MODEL_OPTIONS.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeAgent(idx)}
                      className="text-red-400 hover:text-red-300 px-1.5 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent picker from plugins */}
          <div className="mb-5">
            <label className="text-xs text-gray-400 block mb-1">Add Agents from Plugins</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search agents... (e.g. backend, security, terraform)"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none mb-2"
            />
            <div className="max-h-48 overflow-y-auto border border-gray-600 rounded-lg bg-gray-700/30">
              {(search.trim() ? [['Search Results', filteredAgents] as const] : Object.entries(groupedAgents).sort(([a], [b]) => a.localeCompare(b))).map(([plugin, pluginAgents]) => (
                <div key={plugin}>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase px-3 py-1.5 bg-gray-700/50 sticky top-0">
                    {plugin} ({pluginAgents.length})
                  </div>
                  {pluginAgents.map(a => {
                    const alreadyAdded = agents.some(ag => ag.role === a.name && ag.plugin === a.plugin);
                    return (
                      <button
                        key={`${a.plugin}/${a.name}`}
                        onClick={() => !alreadyAdded && addAgent(a)}
                        disabled={alreadyAdded}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                          alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-600/50'
                        }`}
                      >
                        <span className="text-sm">{a.name}</span>
                        <span className="text-[10px] text-gray-500 flex-1 truncate">{a.description.substring(0, 80)}</span>
                        {!alreadyAdded && <span className="text-blue-400 text-xs flex-shrink-0">+ Add</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
              {search.trim() && filteredAgents.length === 0 && (
                <p className="text-xs text-gray-500 p-3 text-center">No agents match "{search}"</p>
              )}
            </div>
            <p className="text-[10px] text-gray-500 mt-1">{availableAgents.length} agents from {Object.keys(groupedAgents).length} plugins</p>
          </div>

          {/* Instructions */}
          <div className="mb-6">
            <label className="text-xs text-gray-400 block mb-1">
              Instructions — what should the team do?
            </label>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder={"Describe the task for this team. Each agent will execute against the target project using claude CLI.\n\nExample: Add input validation to all API endpoints. Check for SQL injection, XSS, and missing auth checks."}
              rows={4}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none placeholder-gray-500"
            />
            {!projectId && instructions.trim() && (
              <p className="text-xs text-yellow-400 mt-1">Warning: select a project for agents to execute against</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={!teamName.trim() || agents.length === 0 || creating}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg px-4 py-2.5 font-medium transition-colors"
            >
              {creating ? 'Creating...' : `Create Team with ${agents.length} Agent${agents.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 rounded-lg px-6 py-2.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
