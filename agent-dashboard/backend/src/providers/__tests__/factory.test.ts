import { describe, it, expect } from 'vitest';
import { resolveProvider } from '../factory';
import { ClaudeCliProvider } from '../claude';
import { OpenAIProvider } from '../openai';

describe('resolveProvider', () => {
  it('returns Claude for orchestratorProvider=claude', () => {
    const p = resolveProvider(
      { orchestratorProvider: 'claude', orchestratorModel: 'sonnet' },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(ClaudeCliProvider);
  });

  it('returns OpenAI for orchestratorProvider=openai', () => {
    const p = resolveProvider(
      { orchestratorProvider: 'openai', orchestratorModel: 'gpt-4o' },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('defaults to claude when field missing', () => {
    const p = resolveProvider(
      { orchestratorProvider: undefined, orchestratorModel: undefined },
      { projectPath: '/tmp' },
    );
    expect(p).toBeInstanceOf(ClaudeCliProvider);
  });
});
