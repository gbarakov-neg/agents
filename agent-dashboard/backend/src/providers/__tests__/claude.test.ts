import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

import { ClaudeCliProvider } from '../claude';

function fakeProc(stdoutChunks: string[]) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: Readable; stderr: Readable; stdin: Writable; kill: () => void;
  };
  proc.stdout = Readable.from(stdoutChunks.map(s => Buffer.from(s)));
  proc.stderr = Readable.from([]);
  proc.stdin = new Writable({ write(_c, _e, cb) { cb(); } });
  proc.kill = () => {};
  // Emit 'close' after stdout drains — otherwise the close event can beat
  // the 'data' events and fullText will be empty.
  proc.stdout.on('end', () => setImmediate(() => proc.emit('close', 0)));
  return proc;
}

describe('ClaudeCliProvider', () => {
  beforeEach(() => { spawnMock.mockReset(); });

  it('streams chunks and returns fullText', async () => {
    spawnMock.mockReturnValue(fakeProc(['hello ', 'world']));
    const provider = new ClaudeCliProvider({ cwd: '/tmp' });
    const chunks: string[] = [];
    const out = await provider.streamTurn({
      prompt: 'p',
      model: 'sonnet',
      onChunk: c => chunks.push(c),
      signal: new AbortController().signal,
    });
    expect(chunks.join('')).toBe('hello world');
    expect(out.fullText).toBe('hello world');
    expect(spawnMock).toHaveBeenCalledWith('claude',
      ['--print', '--model', 'sonnet'],
      expect.objectContaining({ cwd: '/tmp' }));
  });

  it('passes model string through unchanged for opus/haiku', async () => {
    spawnMock.mockReturnValue(fakeProc(['x']));
    const provider = new ClaudeCliProvider({ cwd: '/tmp' });
    await provider.streamTurn({
      prompt: 'p', model: 'opus', onChunk: () => {},
      signal: new AbortController().signal,
    });
    expect(spawnMock).toHaveBeenCalledWith('claude',
      ['--print', '--model', 'opus'], expect.any(Object));
  });
});
