import { describe, it, expect, vi } from 'vitest';
import { createExecutionAdapter } from '../executionAdapter';
import { MessageStore } from '../store';

describe('executionAdapter', () => {
  it('emits execution_status messages linked to plan', () => {
    const store = new MessageStore();
    const emit = vi.fn();
    const adapter = createExecutionAdapter({ store, emit });

    adapter.emitEvent('t1', 'plan1', {
      phase: 'planning', status: 'started', agentId: 'a1',
    });
    adapter.emitEvent('t1', 'plan1', {
      phase: 'planning', status: 'completed', agentId: 'a1',
    });

    const msgs = store.get('t1');
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toMatchObject({
      kind: 'execution_status', planMessageId: 'plan1',
      phase: 'planning', status: 'started', agentId: 'a1',
    });
    expect(emit).toHaveBeenCalledTimes(2);
  });
});
