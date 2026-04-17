import { useState } from 'react';
import { Team } from '../types';
import AddAgentModal from './AddAgentModal';

const API = 'http://localhost:3001';

const statusColors: Record<string, string> = {
  idle: 'bg-gray-500',
  working: 'bg-blue-500',
  blocked: 'bg-yellow-500',
  complete: 'bg-green-500',
  failed: 'bg-red-500'
};

const statusDot: Record<string, string> = {
  idle: 'bg-gray-400',
  working: 'bg-blue-400 animate-pulse',
  blocked: 'bg-yellow-400 animate-pulse',
  complete: 'bg-green-400',
  failed: 'bg-red-400'
};

function AgentInstructInput({ teamId, agentId, agentName }: { teamId: string; agentId: string; agentName: string }) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      await fetch(`${API}/api/teams/${teamId}/agents/${agentId}/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() })
      });
      setInput('');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-700">
      <div className="text-xs font-semibold text-gray-400 mb-1.5">Instruct {agentName}</div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
          placeholder={`Tell ${agentName} what to do...`}
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none placeholder-gray-600"
          onClick={e => e.stopPropagation()}
        />
        <button
          onClick={(e) => { e.stopPropagation(); handleSend(); }}
          disabled={!input.trim() || sending}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-xs rounded px-3 py-1.5 font-medium transition-colors flex-shrink-0"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default function TeamMonitor({ team }: { team: Team }) {
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const avgProgress = team.agents.length > 0
    ? Math.round(team.agents.reduce((s, a) => s + a.progress, 0) / team.agents.length)
    : 0;

  const handleRemoveAgent = (agentId: string, agentName: string) => {
    if (confirm(`Remove "${agentName}" from the team?`)) {
      fetch(`${API}/api/teams/${team.id}/agents/${agentId}`, { method: 'DELETE' });
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold">Team Members</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">Overall: {avgProgress}%</span>
          <button
            onClick={() => setShowAddAgent(true)}
            className="text-xs bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg font-medium transition-colors"
          >
            + Add Agent
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {team.agents.map(agent => (
          <div key={agent.id} className="flex flex-col">
            <div
              className={`bg-gray-700/60 rounded-lg p-4 border transition-colors group cursor-pointer ${
                expandedAgent === agent.id ? 'rounded-b-none' : '' } ${
                agent.status === 'failed' ? 'border-red-600/50' :
                agent.status === 'complete' ? 'border-green-600/30' :
                'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold">{agent.name}</div>
                  <div className="text-xs text-gray-400">
                    {agent.role}
                    {agent.plugin && <span className="text-gray-600 ml-1">({agent.plugin})</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveAgent(agent.id, agent.name); }}
                    className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-sm"
                    title="Remove agent"
                  >
                    &times;
                  </button>
                  <div className={`w-2 h-2 rounded-full ${statusDot[agent.status]}`} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[agent.status]}/20 text-white`}>
                    {agent.status}
                  </span>
                </div>
              </div>

              {agent.currentTask && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-0.5">Task</div>
                  <div className="text-sm text-gray-300 truncate">{agent.currentTask}</div>
                </div>
              )}

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Progress</span>
                  <span className="font-medium text-gray-300">{agent.progress}%</span>
                </div>
                <div className="w-full bg-gray-600 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      agent.status === 'failed' ? 'bg-red-500' :
                      agent.progress >= 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${agent.progress}%` }}
                  />
                </div>
              </div>

              {agent.filesChanged && agent.filesChanged.length > 0 && (
                <div className="mt-2 text-xs text-green-400">
                  {agent.filesChanged.length} file(s) changed
                </div>
              )}

              <div className="text-xs text-gray-500 mt-2">{agent.model}</div>
            </div>

            {/* Expanded panel */}
            {expandedAgent === agent.id && (
              <div className="bg-gray-900 border border-gray-600 border-t-0 rounded-b-lg p-4 -mt-0.5">
                {/* Per-agent instruction input */}
                <AgentInstructInput teamId={team.id} agentId={agent.id} agentName={agent.name} />

                {agent.filesChanged && agent.filesChanged.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-400 mb-1">Files Changed</div>
                    <div className="space-y-0.5">
                      {agent.filesChanged.map((f, i) => (
                        <div key={i} className="text-xs font-mono text-green-400">{f}</div>
                      ))}
                    </div>
                  </div>
                )}
                {agent.output && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-gray-400 mb-1">Output</div>
                    <pre className="text-xs text-gray-300 bg-gray-950 rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap font-mono leading-relaxed">
                      {agent.output}
                    </pre>
                  </div>
                )}
                {!agent.output && !agent.filesChanged?.length && agent.status === 'idle' && (
                  <p className="mt-3 text-xs text-gray-500">No output yet. Send an instruction to this agent above.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {team.agents.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-2">No agents yet.</p>
          <button
            onClick={() => setShowAddAgent(true)}
            className="text-blue-400 hover:underline text-sm"
          >
            Add the first agent
          </button>
        </div>
      )}

      {team.agents.length > 0 && (
        <div className="mt-5 pt-4 border-t border-gray-600">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Team Progress</span>
            <span>{avgProgress}%</span>
          </div>
          <div className="w-full bg-gray-600 rounded-full h-2.5">
            <div
              className="bg-gradient-to-r from-blue-500 to-green-500 h-2.5 rounded-full transition-all duration-500"
              style={{ width: `${avgProgress}%` }}
            />
          </div>
        </div>
      )}

      {showAddAgent && (
        <AddAgentModal
          teamId={team.id}
          teamName={team.name}
          onClose={() => setShowAddAgent(false)}
        />
      )}
    </div>
  );
}
