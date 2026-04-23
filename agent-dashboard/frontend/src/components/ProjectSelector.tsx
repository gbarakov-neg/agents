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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPath, setEditPath] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setAddError(null);
    try {
      const res = await fetch(`${API}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          path: newPath.trim() || undefined,
          url: newUrl.trim() || undefined,
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const project = await res.json();
      onAddProject(project);
      onSelect(project.id);
      setNewName('');
      setNewPath('');
      setNewUrl('');
      setShowAdd(false);
    } catch (err) {
      setAddError((err as Error).message);
    }
  };

  const handleDelete = async (projectId: string, projectName: string) => {
    if (!confirm(`Delete project "${projectName}"? Teams assigned to it will be unlinked.`)) return;
    await fetch(`${API}/api/projects/${projectId}`, { method: 'DELETE' });
    if (selectedProjectId === projectId) onSelect(null);
  };

  const startEdit = (p: Project) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPath(p.path);
    setEditUrl(p.url || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editPath.trim()) return;
    await fetch(`${API}/api/projects/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), path: editPath.trim(), url: editUrl.trim() || undefined })
    });
    setEditingId(null);
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
          onClick={() => { setShowManage(!showManage); setShowAdd(false); setEditingId(null); }}
          className="text-sm bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg px-2.5 py-1.5 transition-colors text-gray-400"
          title="Manage projects"
        >
          ...
        </button>
      )}

      {/* Add project popup */}
      {showAdd && (
        <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-xl z-50 w-96">
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
              placeholder="Local path — optional, auto-created under ~/claude-projects/ if blank"
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Project URL (e.g. https://my-app.com) — optional"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            {addError && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
                {addError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={!newName.trim()}
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
        <div className="absolute top-full left-0 mt-2 bg-gray-800 border border-gray-600 rounded-xl p-4 shadow-xl z-50 w-[420px] max-h-80 overflow-y-auto">
          <h3 className="text-sm font-semibold mb-3">Manage Projects</h3>
          <div className="space-y-2">
            {projects.map(p => (
              <div key={p.id}>
                {editingId === p.id ? (
                  /* Edit form */
                  <div className="bg-gray-700/50 rounded-lg p-3 border border-blue-500/50 space-y-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Project name"
                      className="w-full bg-gray-600 border border-gray-500 rounded px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={editPath}
                      onChange={e => setEditPath(e.target.value)}
                      placeholder="Local path"
                      className="w-full bg-gray-600 border border-gray-500 rounded px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none font-mono text-xs"
                    />
                    <input
                      type="text"
                      value={editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      placeholder="Project URL (optional)"
                      className="w-full bg-gray-600 border border-gray-500 rounded px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editName.trim() || !editPath.trim()}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-xs rounded px-2 py-1.5 font-medium transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex-1 bg-gray-600 hover:bg-gray-500 text-xs rounded px-2 py-1.5 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display row */
                  <div className="flex items-center justify-between bg-gray-700/50 rounded-lg p-2.5 group">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-gray-500 font-mono truncate">{p.path}</div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 truncate block">
                          {p.url}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                      <button
                        onClick={() => startEdit(p)}
                        className="text-gray-400 hover:text-blue-400 text-xs px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="text-gray-400 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={() => { setShowManage(false); setEditingId(null); }}
            className="w-full mt-3 bg-gray-700 hover:bg-gray-600 text-sm rounded-lg px-3 py-1.5 transition-colors"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
