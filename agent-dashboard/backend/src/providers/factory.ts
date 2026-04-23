import { ClaudeCliProvider } from './claude';
import { OpenAIProvider } from './openai';
import type { OrchestratorProvider } from './types';

export type ProviderName = 'claude' | 'openai';

export interface TeamProviderConfig {
  orchestratorProvider: ProviderName | undefined;
  orchestratorModel: string | undefined;
}

export interface FactoryOpts {
  projectPath: string;
}

export function defaultProvider(): ProviderName {
  const env = (process.env.DEFAULT_ORCHESTRATOR_PROVIDER ?? '').toLowerCase();
  return env === 'openai' ? 'openai' : 'claude';
}

export function defaultModelFor(provider: ProviderName): string {
  return provider === 'openai' ? 'gpt-4o' : 'sonnet';
}

export function resolveProvider(
  cfg: TeamProviderConfig,
  opts: FactoryOpts,
): OrchestratorProvider {
  const name = cfg.orchestratorProvider ?? defaultProvider();
  if (name === 'openai') return new OpenAIProvider();
  return new ClaudeCliProvider({ cwd: opts.projectPath });
}
