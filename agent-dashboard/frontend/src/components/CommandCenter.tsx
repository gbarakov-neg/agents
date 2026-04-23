import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import type { Message } from '../types';
import MessageThread from './MessageThread';

const API = 'http://localhost:3001';
const socket = io(API);

export default function CommandCenter({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API}/api/teams/${teamId}/messages`)
      .then(r => r.json())
      .then(d => setMessages(d.messages ?? []))
      .catch(() => {});
  }, [teamId]);

  useEffect(() => {
    const onMsg = ({ teamId: tid, message }: { teamId: string; message: Message }) => {
      if (tid !== teamId) return;
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) {
          return prev.map(m => m.id === message.id ? message : m);
        }
        return [...prev, message];
      });
    };
    socket.on('chat:message', onMsg);
    return () => { socket.off('chat:message', onMsg); };
  }, [teamId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    const content = input.trim();
    if (!content || streaming) return;
    setInput('');
    setStreaming(true);
    try {
      const res = await fetch(`${API}/api/teams/${teamId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const reader = res.body?.getReader();
      if (reader) {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
          // We rely on the socket 'chat:message' events for canonical state;
          // SSE chunks are only used to show "streaming..." indicator.
        }
      }
    } finally {
      setStreaming(false);
    }
  };

  const approve = async (planMessageId: string, itemIds: string[]) => {
    const res = await fetch(`${API}/api/teams/${teamId}/messages/${planMessageId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds }),
    });
    if (!res.ok) throw new Error(`approve failed: ${res.status}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/80">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Command Center</h2>
          <span className="text-xs text-gray-500">{teamName}</span>
          {streaming && (
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium animate-pulse">
              streaming
            </span>
          )}
        </div>
      </div>
      <div className="p-5">
        <div className="max-h-96 overflow-y-auto mb-3 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
          {messages.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">
              Tell the orchestrator what you want. It'll reply, or propose a plan you can approve.
            </p>
          ) : (
            <MessageThread messages={messages} onApprove={approve} />
          )}
          <div ref={endRef} />
        </div>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask or tell the orchestrator..."
          rows={3}
          disabled={streaming}
          className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-4 py-3 text-sm resize-none focus:border-blue-500 focus:outline-none placeholder-gray-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-gray-600">Enter to send · Shift+Enter for newline</span>
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="text-sm rounded-lg px-5 py-1.5 font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white"
          >
            {streaming ? 'Streaming...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
