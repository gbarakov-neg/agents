import { useState } from 'react';
import type { Message, Priority } from '../types';

type Plan = Extract<Message, { kind: 'plan_proposal' }>;

const PRIORITY_STYLE: Record<Priority, string> = {
  high: 'bg-red-500/20 text-red-300',
  medium: 'bg-amber-500/20 text-amber-300',
  low: 'bg-gray-500/20 text-gray-300',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'HIGH', medium: 'MED', low: 'LOW',
};

export default function PlanProposalCard({
  plan,
  onResolve,
}: {
  plan: Plan;
  onResolve: (itemIds: string[]) => Promise<void>;
}) {
  const locked = plan.approval !== 'pending';
  const [checked, setChecked] = useState<Set<string>>(
    new Set(plan.approvedItemIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    if (locked) return;
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submit = async (ids: string[]) => {
    setSubmitting(true);
    try { await onResolve(ids); } finally { setSubmitting(false); }
  };

  return (
    <div className="border border-gray-700 bg-gray-800 rounded-lg p-4 max-w-[90%]">
      <div className="text-sm font-semibold mb-2 text-gray-200">{plan.summary}</div>
      <ul className="space-y-1.5 mb-3">
        {plan.items.map(item => {
          const isChecked = checked.has(item.id);
          const wasApproved = (plan.approvedItemIds ?? []).includes(item.id);
          return (
            <li key={item.id} className="flex items-start gap-2">
              <input
                type="checkbox"
                id={`item-${plan.id}-${item.id}`}
                checked={isChecked || (locked && wasApproved)}
                disabled={locked || submitting}
                onChange={() => toggle(item.id)}
                className="mt-1"
              />
              <label htmlFor={`item-${plan.id}-${item.id}`} className="flex-1 text-sm text-gray-200">
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mr-2 ${PRIORITY_STYLE[item.priority]}`}>
                  {PRIORITY_LABEL[item.priority]}
                </span>
                {item.title}
                {item.detail && <div className="text-xs text-gray-400 mt-0.5">{item.detail}</div>}
                {item.suggestedAgent && (
                  <div className="text-[10px] text-indigo-300 mt-0.5">→ {item.suggestedAgent}</div>
                )}
                {locked && wasApproved && <span className="ml-2 text-green-400">✓</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-2">
        <button
          onClick={() => submit([...checked])}
          disabled={locked || submitting || checked.size === 0}
          className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded px-3 py-1 text-white"
        >
          {submitting ? '...' : 'Approve selected'}
        </button>
        <button
          onClick={() => submit([])}
          disabled={locked || submitting}
          className="text-sm bg-gray-700 hover:bg-gray-600 disabled:cursor-not-allowed rounded px-3 py-1 text-gray-200"
        >
          Decline
        </button>
        {locked && (
          <span className="text-xs ml-auto">
            {plan.approval === 'approved' ? (
              <span className="text-green-400">Approved</span>
            ) : (
              <span className="text-gray-400">Declined</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
