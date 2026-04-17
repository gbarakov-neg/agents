import { useState } from 'react';
import { Project } from '../types';

const API = 'http://localhost:3001';

interface Props {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
  onAddProject: (project: Project) => void;
}

export default function ProjectSelector({ projects, selectedProjectId, onSelect, onAddProject }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');

  const handleAdd = async () => {
    if (!newName.trim() || !newPath.trim()) return;
    const res = await fetch(`${API}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), path: newPath.trim() })
    });
    const project = await res.json();
    onAddProject(project);
    onSelect(project.id);
    setNewName('');
    setNewPath('');
    setShowAdd(false);
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Teams assigned to it will be unlinked.`)) return;
    await fetch(`${API}/api/projects/${projectId}`, { method: 'DELETE' });
    if (selectedProjectId === projectId) onSelect(null);
  };

  return (
    <div className="relative flex items-center gap-2">
      <select
        value={selectedProjectId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="bg-gray-700 border border-gray-600 text-sm rounded-lg px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none min-w-[180px]"
      >
        <option value="">All Projects</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <button
        onClick={() => { setShowAdd(!showAdd); setShowManage(false); }}
        className="text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-2.5 py-1.5 transition-colors"
        title="Add project"
      >
        +
      </button>

      {projects.length > 0 && (
        <button
          onClick={() => { setShowManage(!showManage); setShowAdd(false); }}
          className="text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-2.5 py-1.5 transition-colors text-gray-400"
          title="Manage projects"
        >
          ...
        </button>
      )}

      {/* Add project popup */}
      {showAdd && (
        <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-xl z-50 w-80">
          <h3 className="text-sm font-semibold mb-3">Add Project / Repo</h3>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Project name (e.g. my-api)"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Path (e.g. /Users/dev/my-api)"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || !newPath.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm rounded-lg px-3 py-1.5 font-medium transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage projects popup */}
      {showManage && (
        <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-xl z-50 w-80 max-h-64 overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3">Manage Projects</h3>
          <div className="space-y-1.5">
            {projects.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono truncate">{p.path}</div>
                </div>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="text-red-400 hover:text-red-300 text-xs ml-2 flex-shrink-0 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setShowManage(false)}
            className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg px-3 py-1.5 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
