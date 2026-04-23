import { agentColor } from '../lib/agentColor';
import type { Message } from '../types';

type Props = {
  msg: Extract<Message, { kind: 'execution_status' }>;
  agentName?: string;
};

export default function ExecutionStatusRow({ msg, agentName }: Props) {
  const color = agentColor(msg.agentId ?? msg.phase);
  const glyph =
    msg.status === 'completed' ? '✓' :
    msg.status === 'failed'    ? '✗' :
    '·';
  const dotCls =
    msg.status === 'progress' ? `${color.dot} animate-pulse` :
    msg.status === 'started'  ? `${color.dot} animate-pulse` :
    color.dot;
  return (
    <div className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${color.bg}`}>
      <span className={`w-2 h-2 rounded-full ${dotCls}`} />
      <span className={color.fg}>{agentName ?? msg.agentId ?? 'orchestrator'}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-400">{msg.phase}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-300">{glyph} {msg.status}</span>
      {msg.detail && <span className="text-gray-500 truncate">— {msg.detail}</span>}
    </div>
  );
}
