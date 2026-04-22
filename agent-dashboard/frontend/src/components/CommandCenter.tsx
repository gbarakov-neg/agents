import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Instruction } from '../types';

const API = 'http://localhost:3001';
const socket = io(API);

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const instructionStatusStyle: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400',
  acknowledged: 'bg-blue-500/20 text-blue-400',
  executing: 'bg-purple-500/20 text-purple-400',
  clarifying: 'bg-orange-500/20 text-orange-400',
  done: 'bg-green-500/20 text-green-400',
  failed: 'bg-red-500/20 text-red-400',
};

export default function CommandCenter({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [instructions, setInstructions] = useState<Instruction[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'orchestrate' | 'parallel' | 'chat'>('orchestrate');
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [tab, setTab] = useState<'command' | 'history'>('command');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/teams/${teamId}/chat`).then(r => r.json()),
      fetch(`${API}/api/teams/${teamId}/instructions`).then(r => r.json()),
    ]).then(([chatData, instrData]) => {
      setMessages(chatData.messages || []);
      setInstructions(instrData.instructions || []);
    }).catch(() => {});
  }, [teamId]);

  // Listen for orchestrator messages
  useEffect(() => {
    const handleQuestions = ({ teamId: tid }: { teamId: string }) => {
      if (tid === teamId) {
        fetch(`${API}/api/teams/${teamId}/chat`)
          .then(r => r.json())
          .then(data => setMessages(data.messages || []))
          .catch(() => {});
        setMode('chat'); // Switch to chat mode to show questions
      }
    };
    const handleChatMsg = ({ teamId: tid, message }: { teamId: string; message: ChatMessage }) => {
      if (tid === teamId) {
        setMessages(prev => [...prev, message]);
      }
    };
    socket.on('chat:questions', handleQuestions);
    socket.on('chat:message', handleChatMsg);
    return () => {
      socket.off('chat:questions', handleQuestions);
      socket.off('chat:message', handleChatMsg);
    };
  }, [teamId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sending || streaming) return;
    setInput('');

    if (mode === 'chat') {
      // Chat mode — conversational with orchestrator
      const userMsg: ChatMessage = { role: 'user', content, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, userMsg]);
      setStreaming(true);

      const assistantMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, assistantMsg]);

      try {
        const response = await fetch(`${API}/api/teams/${teamId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: content })
        });

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const text = decoder.decode(value);
            for (const line of text.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.chunk) {
                    fullText += data.chunk;
                    setMessages(prev => {
                      const updated = [...prev];
                      updated[updated.length - 1] = { ...updated[updated.length - 1], content: fullText };
                      return updated;
                    });
                  }
                } catch {}
              }
            }
          }
        }
      } catch {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: 'Error: Failed to reach orchestrator' };
          return updated;
        });
      } finally {
        setStreaming(false);
      }
    } else {
      // Execute mode — send instruction to agents
      setSending(true);
      try {
        const res = await fetch(`${API}/api/teams/${teamId}/instructions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, mode })
        });
        const instr = await res.json();
        setInstructions(prev => [...prev, instr]);
      } finally {
        setSending(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (mode === 'chat' ? !e.shiftKey : (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSend();
    }
  };

  const activeInstructions = instructions.filter(i => i.status === 'executing' || i.status === 'clarifying');

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header with tabs */}
      <div className="px-5 py-3 border-b border-gray-700 flex items-center justify-between bg-gray-800/80">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Command Center</h2>
          <span className="text-xs text-gray-500">{teamName}</span>
          {activeInstructions.length > 0 && (
            <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-medium animate-pulse">
              {activeInstructions.length} running
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setTab('command')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              tab === 'command' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            Command
          </button>
          <button
            onClick={() => setTab('history')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              tab === 'history' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            History ({instructions.length})
          </button>
        </div>
      </div>

      {tab === 'command' ? (
        <div className="p-5">
          {/* Mode selector */}
          <div className="flex items-center gap-1.5 mb-3">
            {[
              { key: 'orchestrate' as const, label: 'Orchestrate', desc: 'Plans phases, picks agents, asks before executing' },
              { key: 'parallel' as const, label: 'Parallel', desc: 'All agents run simultaneously, same instruction' },
              { key: 'chat' as const, label: 'Chat', desc: 'Talk with orchestrator — analyze, plan, get advice' },
            ].map(m => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  mode === m.key
                    ? m.key === 'chat'
                      ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                      : m.key === 'orchestrate'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                        : 'bg-green-600/30 border-green-500 text-green-300'
                    : 'bg-gray-700 border-gray-600 text-gray-400 hover:text-gray-200'
                }`}
              >
                {m.label}
              </button>
            ))}
            <span className="text-[10px] text-gray-600 ml-2">
              {mode === 'orchestrate' ? 'Plans phases, picks agents, asks before executing'
                : mode === 'parallel' ? 'All agents run simultaneously, same instruction'
                : 'Talk with orchestrator — analyze, plan, get advice'}
            </span>
          </div>

          {/* Chat messages (visible in chat mode or when orchestrator sends messages) */}
          {(mode === 'chat' || messages.length > 0) && (
            <div ref={scrollRef} className="max-h-64 overflow-y-auto mb-3 space-y-2 border border-gray-700 rounded-lg p-3 bg-gray-900/50">
              {messages.length === 0 && mode === 'chat' && (
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500">Ask the orchestrator anything about your project or team.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
                    {['What agents do I need?', 'Roast this project', 'Plan next steps'].map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setInput(s)}
                        className="text-[10px] bg-gray-700/50 hover:bg-gray-700 text-gray-400 px-2 py-1 rounded transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.slice(-20).map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-lg px-3 py-2 ${
                    msg.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-gray-700/80 text-gray-200'
                  }`}>
                    <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">{msg.content || (streaming ? '...' : '')}</pre>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input */}
          <div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'chat'
                  ? 'Ask the orchestrator... (Enter to send)'
                  : mode === 'orchestrate'
                    ? 'Describe what to build. The orchestrator will plan, recommend agents, and ask before executing...'
                    : 'Instruction for all agents in parallel...'
              }
              rows={mode === 'chat' ? 2 : 3}
              disabled={sending || streaming}
              className="w-full bg-gray-700/60 border border-gray-600 rounded-lg px-4 py-3 text-sm resize-none focus:border-blue-500 focus:outline-none placeholder-gray-500 leading-relaxed disabled:opacity-50"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-gray-600">
                {mode === 'chat' ? 'Enter to send' : `${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to execute`}
              </span>
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending || streaming}
                className={`text-sm rounded-lg px-5 py-1.5 font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed ${
                  mode === 'chat'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {sending ? 'Sending...' : streaming ? 'Streaming...'
                  : mode === 'chat' ? 'Send' : mode === 'orchestrate' ? 'Execute (Orchestrated)' : 'Execute (Parallel)'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* History tab */
        <div className="p-5 max-h-80 overflow-y-auto">
          {instructions.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No instructions sent yet</p>
          ) : (
            <div className="space-y-2">
              {[...instructions].reverse().map(instr => (
                <div key={instr.id} className="bg-gray-700/30 rounded-lg p-3 border border-gray-600/30">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm text-gray-200 flex-1 whitespace-pre-wrap line-clamp-3">{instr.content}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${instructionStatusStyle[instr.status] || instructionStatusStyle.pending}`}>
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
      )}
    </div>
  );
}
