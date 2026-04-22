import { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

export default function NotionSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [databaseId, setDatabaseId] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    fetch(`${API}/api/notion/status`)
      .then(r => r.json())
      .then(data => setEnabled(data.enabled))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!token.trim() || !databaseId.trim()) return;
    setSaving(true);
    setStatus('idle');
    try {
      const res = await fetch(`${API}/api/notion/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), databaseId: databaseId.trim() })
      });
      const data = await res.json();
      if (data.enabled) {
        setEnabled(true);
        setStatus('success');
        setToken('');
        setDatabaseId('');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-lg border transition-colors ${
          enabled
            ? 'bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20'
            : 'bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600'
        }`}
        title={enabled ? 'Notion connected' : 'Configure Notion'}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.26 2.23c-.42-.326-.98-.7-2.055-.607L3.01 2.87c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.046-.747.326-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.326-1.167.514-1.635.514-.747 0-.933-.233-1.493-.933l-4.577-7.186v6.952l1.447.327s0 .84-1.167.84l-3.22.186c-.093-.186 0-.653.327-.746l.84-.233V8.858l-1.166-.093c-.094-.42.14-1.027.793-1.073l3.453-.233 4.764 7.279v-6.44l-1.214-.14c-.093-.513.28-.886.747-.933zM2.1 1.542l13.726-1.02c1.682-.14 2.1.047 2.8.56l3.827 2.706c.467.326.607.746.607 1.26v15.58c0 .98-.374 1.587-1.682 1.68l-15.457.934c-.98.046-1.448-.093-1.962-.747L.98 19.323c-.56-.746-.793-1.306-.793-1.96V3.128c0-.84.374-1.494 1.914-1.586z"/>
        </svg>
        <span className="text-xs">{enabled ? 'Notion' : 'Notion'}</span>
        {enabled && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-gray-800 border border-gray-600 rounded-xl p-5 shadow-xl z-50 w-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Notion Integration</h3>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">&times;</button>
          </div>

          {enabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm text-green-300">Connected to Notion</span>
              </div>
              <p className="text-xs text-gray-400">
                Orchestrated tasks will automatically create tickets in your Notion database with agent reports, status updates, and file change logs.
              </p>
              <div className="border-t border-gray-700 pt-3">
                <p className="text-xs text-gray-500 mb-2">Reconfigure with new credentials:</p>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="New Notion token"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={databaseId}
                    onChange={e => setDatabaseId(e.target.value)}
                    placeholder="New Database ID"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSave}
                    disabled={!token.trim() || !databaseId.trim() || saving}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm rounded-lg px-3 py-1.5 font-medium transition-colors"
                  >
                    {saving ? 'Saving...' : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">
                Connect Notion to automatically create tickets for each task with agent reports and status tracking.
              </p>

              <div className="bg-gray-700/50 rounded-lg p-3 text-xs text-gray-400 space-y-2">
                <p className="font-medium text-gray-300">Setup steps:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Go to notion.so/my-integrations and create an integration</li>
                  <li>Copy the Internal Integration Token</li>
                  <li>Create a database with columns: Name (title), Status (select), Team (text), Project (text)</li>
                  <li>Share the database with your integration (... menu &rarr; Connections)</li>
                  <li>Copy the Database ID from the page URL</li>
                </ol>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Integration Token</label>
                  <input
                    type="password"
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="ntn_xxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Database ID</label>
                  <input
                    type="text"
                    value={databaseId}
                    onChange={e => setDatabaseId(e.target.value)}
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-gray-600 mt-1">The 32-character ID from your database URL</p>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={!token.trim() || !databaseId.trim() || saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm rounded-lg px-3 py-2 font-medium transition-colors"
              >
                {saving ? 'Connecting...' : 'Connect Notion'}
              </button>

              {status === 'success' && (
                <p className="text-xs text-green-400 text-center">Connected successfully!</p>
              )}
              {status === 'error' && (
                <p className="text-xs text-red-400 text-center">Failed to connect. Check your credentials.</p>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
