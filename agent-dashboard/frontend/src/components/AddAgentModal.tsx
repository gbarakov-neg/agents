import { useState } from 'react';

const API = 'http://localhost:3001';

const ROLE_PRESETS = [
  { name: 'Backend Developer', role: 'backend-developer' },
  { name: 'Frontend Developer', role: 'frontend-developer' },
  { name: 'Database Engineer', role: 'database-engineer' },
  { name: 'Test Automator', role: 'test-automator' },
  { name: 'Security Auditor', role: 'security-auditor' },
  { name: 'DevOps Engineer', role: 'devops-engineer' },
  { name: 'API Developer', role: 'api-developer' },
  { name: 'Performance Engineer', role: 'performance-engineer' },
  { name: 'Code Reviewer', role: 'code-reviewer' },
  { name: 'Architect', role: 'architect' },
];

const MODEL_OPTIONS = [
  { value: 'claude-opus-4-6', label: 'Opus (complex tasks)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet (balanced)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku (fast tasks)' },
];

interface Props {
  teamId: string;
  teamName: string;
  onClose: () => void;
}

export default function AddAgentModal({ teamId, teamName, onClose }: Props) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [adding, setAdding] = useState(false);

  const pickPreset = (preset: { name: string; role: string }) => {
    setName(preset.name);
    setRole(preset.role);
  };

  const handleAdd = async () => {
    if (!name.trim() || !role.trim()) return;
    setAdding(true);
    try {
      await fetch(`${API}/api/teams/${teamId}/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), role: role.trim(), model })
      });
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-bold">Add Agent</h2>
              <p className="text-xs text-gray-400">to {teamName}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">&times;</button>
          </div>

          {/* Quick presets */}
          <div className="mb-4">
            <label className="text-xs text-gray-400 block mb-1.5">Quick Pick</label>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_PRESETS.map(preset => (
                <button
                  key={preset.role}
                  onClick={() => pickPreset(preset)}
                  className={`text-[11px] border px-2 py-1 rounded transition-colors ${
                    role === preset.role
                      ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                      : 'bg-gray-700 hover:bg-gray-600 border-gray-600'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 mb-5">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Agent display name"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Role</label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="e.g. backend-developer"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {MODEL_OPTIONS.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAdd}
              disabled={!name.trim() || !role.trim() || adding}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg px-4 py-2 font-medium text-sm transition-colors"
            >
              {adding ? 'Adding...' : 'Add Agent'}
            </button>
            <button
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 rounded-lg px-5 py-2 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
