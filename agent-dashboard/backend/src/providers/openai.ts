import OpenAI from 'openai';
import type { OrchestratorProvider, StreamTurnArgs, StreamTurnResult } from './types';

export class MissingOpenAiKeyError extends Error {
  constructor() { super('OPENAI_API_KEY is not set'); }
}

export class OpenAIProvider implements OrchestratorProvider {
  async streamTurn({ prompt, model, onChunk, signal }: StreamTurnArgs): Promise<StreamTurnResult> {
    if (!process.env.OPENAI_API_KEY) throw new MissingOpenAiKeyError();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const stream = await client.responses.stream({
      model,
      input: prompt,
    });

    let full = '';
    const onAbort = () => { try { (stream as unknown as { controller?: AbortController }).controller?.abort(); } catch {} };
    signal.addEventListener('abort', onAbort);

    try {
      for await (const event of stream as AsyncIterable<{ type: string; delta?: string }>) {
        if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
          full += event.delta;
          onChunk(event.delta);
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
    return { fullText: full };
  }
}
