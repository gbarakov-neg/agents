import { spawn } from 'node:child_process';
import type { OrchestratorProvider, StreamTurnArgs, StreamTurnResult } from './types';

export class ClaudeCliProvider implements OrchestratorProvider {
  constructor(private readonly opts: { cwd: string }) {}

  streamTurn({ prompt, model, onChunk, signal }: StreamTurnArgs): Promise<StreamTurnResult> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['--print', '--model', model], {
        cwd: this.opts.cwd,
        env: { ...process.env, CLAUDE_CODE_ENTRYPOINT: 'agent-dashboard-chat' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let full = '';
      const onAbort = () => { try { proc.kill(); } catch {} };
      signal.addEventListener('abort', onAbort);

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (d: Buffer) => {
        const s = d.toString();
        full += s;
        onChunk(s);
      });

      proc.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      proc.on('close', () => {
        signal.removeEventListener('abort', onAbort);
        resolve({ fullText: full });
      });
    });
  }
}
