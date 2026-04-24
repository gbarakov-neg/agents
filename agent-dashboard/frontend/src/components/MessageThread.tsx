import type { Message } from '../types';
import PlanProposalCard from './PlanProposalCard';
import ExecutionStatusRow from './ExecutionStatusRow';

export default function MessageThread({
  messages,
  onApprove,
}: {
  messages: Message[];
  onApprove: (planMessageId: string, itemIds: string[]) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {messages.map(msg => {
        if (msg.kind === 'text') {
          return (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                msg.role === 'user' ? 'bg-blue-600/80 text-white' : 'bg-gray-700/80 text-gray-200'
              }`}>
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">{msg.content}</pre>
              </div>
            </div>
          );
        }
        if (msg.kind === 'plan_proposal') {
          return (
            <div key={msg.id} className="flex justify-start">
              <PlanProposalCard
                plan={msg}
                onResolve={(ids) => onApprove(msg.id, ids)}
              />
            </div>
          );
        }
        // execution_status
        return <ExecutionStatusRow key={msg.id} msg={msg} />;
      })}
    </div>
  );
}
