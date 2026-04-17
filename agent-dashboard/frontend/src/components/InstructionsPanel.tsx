import { useState, useEffect } from 'react';
import { Instruction } from '../types';

const API = 'http://localhost:3001';

const statusStyle: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  acknowledged: 'bg-blue-500/20 text-blue-400',
  executing: 'bg-purple-500/20 text-purple-400',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

export default function InstructionsPanel({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'orchestrate' | 'parallel'>('orchestrate');
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/teams/${teamId}/instructions`)
      .then(r => r.json())
      .then(data => setInstructions(data.instructions))
      .catch(() => {});
  }, [teamId]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/instructions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mode })
      });
      const instr = await res.json();
      setInstructions(prev => [...prev, instr]);
      setInput('');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const pendingCount = instructions.filter(i => i.status === 'pending' || i.status === 'executing').length;

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/80">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">Instructions</h2>
          <span className="text-xs text-gray-400">to {teamName}</span>
          {pendingCount > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-medium">
              {pendingCount} active
            </span>
          )}
        </div>
        {instructions.length > 0 && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {showHistory ? 'Hide' : 'Show'} history ({instructions.length})
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Mode selector */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">Execution mode:</span>
          <button
            onClick={() => setMode('orchestrate')}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              mode === 'orchestrate'
                ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200'
            }`}
          >
            Orchestrated
          </button>
          <button
            onClick={() => setMode('parallel')}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              mode === 'parallel'
                ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200'
            }`}
          >
            Parallel
          </button>
          <span className="text-[10px] text-gray-600 ml-1">
            {mode === 'orchestrate'
              ? 'Plans phases, sequences work, passes context between agents'
              : 'All agents run simultaneously with the same instruction'}
          </span>
        </div>

        {/* Input area */}
        <div className="mb-4">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell the team what to do... The orchestrator will break it into sub-tasks per agent role."
            rows={3}
            className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-4 py-3 text-sm resize-none focus:border-blue-500 focus:outline-none placeholder-gray-500 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-gray-500">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to send
            </span>
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm rounded-lg px-5 py-1.5 font-medium transition-colors"
            >
              {sending ? 'Sending...' : 'Send Instruction'}
            </button>
          </div>
        </div>

        {/* History */}
        {showHistory && instructions.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto border-t border-gray-700 pt-3">
            {[...instructions].reverse().map(instr => (
              <div key={instr.id} className="bg-gray-700/30 rounded-lg p-3 border border-gray-600/30">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="text-sm text-gray-200 flex-1 whitespace-pre-wrap">{instr.content}</p>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${statusStyle[instr.status] || statusStyle.pending}`}>
                    {instr.status}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  {new Date(instr.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
