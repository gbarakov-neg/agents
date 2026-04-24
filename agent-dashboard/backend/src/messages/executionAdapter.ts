import { randomUUID } from 'node:crypto';
import { MessageStore } from './store';
import type { ExecutionStatus, Message } from './types';

export interface ExecutionEvent {
  phase: string;
  status: ExecutionStatus;
  agentId?: string;
  detail?: string;
}

export interface ExecutionAdapter {
  emitEvent(teamId: string, planMessageId: string, evt: ExecutionEvent): void;
}

export function createExecutionAdapter(deps: {
  store: MessageStore;
  emit: (event: string, payload: unknown) => void;
}): ExecutionAdapter {
  return {
    emitEvent(teamId, planMessageId, evt) {
      const msg: Message = {
        id: randomUUID(),
        role: 'system',
        kind: 'execution_status',
        planMessageId,
        phase: evt.phase,
        status: evt.status,
        agentId: evt.agentId,
        detail: evt.detail,
        createdAt: new Date().toISOString(),
      };
      deps.store.append(teamId, msg);
      deps.emit('chat:message', { teamId, message: msg });
    },
  };
}
