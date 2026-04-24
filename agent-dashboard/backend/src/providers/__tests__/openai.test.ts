import { describe, it, expect, vi } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

const streamEvents = [
  { type: 'response.output_text.delta', delta: 'hel' },
  { type: 'response.output_text.delta', delta: 'lo' },
  { type: 'response.completed' },
];

async function* fakeStream() {
  for (const e of streamEvents) yield e;
}

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    responses = { stream: createMock };
  },
}));

import { OpenAIProvider } from '../openai';

describe('OpenAIProvider', () => {
  it('missing API key throws a clear error', async () => {
    delete process.env.OPENAI_API_KEY;
    const p = new OpenAIProvider();
    await expect(p.streamTurn({
      prompt: 'x', model: 'gpt-4o',
      onChunk: () => {}, signal: new AbortController().signal,
    })).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('streams deltas and returns full text', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    createMock.mockImplementation(async () => fakeStream());
    const chunks: string[] = [];
    const p = new OpenAIProvider();
    const out = await p.streamTurn({
      prompt: 'x', model: 'gpt-4o',
      onChunk: c => chunks.push(c),
      signal: new AbortController().signal,
    });
    expect(chunks.join('')).toBe('hello');
    expect(out.fullText).toBe('hello');
    expect(createMock).toHaveBeenCalled();
  });
});
