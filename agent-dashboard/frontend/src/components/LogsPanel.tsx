import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { LogEntry } from '../types';

const API = 'http://localhost:3001';
const socket = io(API);

const levelColors: Record<string, string> = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400'
};

export default function LogsPanel({ teamId }: { teamId: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial logs
  useEffect(() => {
    fetch(`${API}/api/logs/${teamId}`)
      .then(r => r.json())
      .then(data => setLogs(data.logs || []))
      .catch(() => {});
  }, [teamId]);

  // Listen for new logs
  useEffect(() => {
    const handler = (log: LogEntry) => {
      if (log.teamId === teamId) {
        setLogs(prev => [...prev.slice(-200), log]); // keep last 200
      }
    };
    socket.on('log:created', handler);
    return () => { socket.off('log:created', handler); };
  }, [teamId]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  return (
    <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold">
          Logs & Events
          {logs.length > 0 && <span className="text-xs text-gray-500 font-normal ml-2">({logs.length})</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`text-[10px] px-2 py-0.5 rounded ${autoScroll ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-700 text-gray-500'}`}
          >
            {autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          </button>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-0.5 rounded bg-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="space-y-0.5 max-h-64 overflow-y-auto font-mono text-xs scroll-smooth">
        {logs.length === 0 ? (
          <p className="text-gray-500 py-4 text-center font-sans">
            No logs yet. Send instructions to start seeing activity.
          </p>
        ) : (
          logs.map(log => (
            <div key={log.id} className="flex gap-2 py-1 border-b border-gray-700/30 hover:bg-gray-700/20">
              <span className="text-gray-600 flex-shrink-0 w-16">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className={`flex-shrink-0 uppercase font-bold w-10 ${levelColors[log.level]}`}>
                {log.level}
              </span>
              <span className="text-gray-300 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
