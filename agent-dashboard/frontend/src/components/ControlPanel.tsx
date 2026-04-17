import { Team, Project } from '../types';

const API = 'http://localhost:3001';

export default function ControlPanel({ team, projects }: { team: Team; projects: Project[] }) {
  const handlePause = () => fetch(`${API}/api/teams/${team.id}/pause`, { method: 'POST' });
  const handleResume = () => fetch(`${API}/api/teams/${team.id}/resume`, { method: 'POST' });
  const handleShutdown = () => {
    if (confirm('Shut down this team?')) {
      fetch(`${API}/api/teams/${team.id}/shutdown`, { method: 'POST' });
    }
  };

  const handleProjectChange = (projectId: string) => {
    fetch(`${API}/api/teams/${team.id}/project`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectId || null })
    });
  };

  const elapsed = team.startedAt
    ? Math.round((Date.now() - new Date(team.startedAt).getTime()) / 60000)
    : 0;
  const hours = Math.floor(elapsed / 60);
  const mins = elapsed % 60;

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <h2 className="text-lg font-bold mb-4">Team Control</h2>

      {/* Project assignment */}
      <div className="mb-4">
        <label className="text-xs text-gray-400 block mb-1">Assigned Project</label>
        <select
          value={team.projectId || ''}
          onChange={e => handleProjectChange(e.target.value)}
          className="w-full bg-gray-700 border border-gray-600 text-sm rounded-lg px-3 py-1.5 text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          <option value="">No project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name} — {p.path}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <button
          onClick={handlePause}
          disabled={team.status !== 'active'}
          className="px-3 py-2 text-sm bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          Pause
        </button>
        <button
          onClick={handleResume}
          disabled={team.status !== 'paused'}
          className="px-3 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          Resume
        </button>
        <button
          onClick={handleShutdown}
          disabled={team.status === 'complete'}
          className="px-3 py-2 text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          Shutdown
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center bg-gray-700/40 rounded-lg p-3">
        <div>
          <div className="text-xs text-gray-400">Status</div>
          <div className={`text-sm font-bold ${
            team.status === 'active' ? 'text-green-400' :
            team.status === 'paused' ? 'text-yellow-400' :
            team.status === 'complete' ? 'text-blue-400' :
            'text-gray-400'
          }`}>
            {team.status.toUpperCase()}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Phase</div>
          <div className="text-sm font-bold capitalize">{team.phase}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400">Duration</div>
          <div className="text-sm font-bold">{hours}h {mins}m</div>
        </div>
      </div>
    </div>
  );
}
