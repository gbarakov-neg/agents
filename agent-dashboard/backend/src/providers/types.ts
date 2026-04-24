export interface StreamTurnArgs {
  prompt: string;
  model: string;
  onChunk: (text: string) => void;
  signal: AbortSignal;
}

export interface StreamTurnResult {
  fullText: string;
}

export interface OrchestratorProvider {
  streamTurn(args: StreamTurnArgs): Promise<StreamTurnResult>;
}
