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
      let stderr = '';
      const onAbort = () => { try { proc.kill(); } catch {} };
      signal.addEventListener('abort', onAbort);

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (d: Buffer) => {
        const s = d.toString();
        full += s;
        onChunk(s);
      });

      proc.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      proc.on('close', (code) => {
        signal.removeEventListener('abort', onAbort);
        if (full.trim().length === 0) {
          // Surface whatever Claude CLI wrote so failures aren't invisible.
          const detail = stderr.trim() || `claude exited with code ${code} and no output`;
          console.error('[ClaudeCliProvider] empty stdout. cwd=%s model=%s exit=%d stderr=%s',
            this.opts.cwd, `(model passed in)`, code, detail.slice(0, 500));
          reject(new Error(`claude CLI produced no output: ${detail}`));
          return;
        }
        resolve({ fullText: full });
      });
    });
  }
}
