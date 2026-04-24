import { isNotionEnabled } from '../../notion.js';
import { LocalMarkdownProjectDoc } from './localSink';
import { NotionProjectDoc } from './notionSink';
import type { ProjectDocSink } from './types';

export interface FactoryOpts {
  localRootDir: string;
}

export function resolveProjectDoc(opts: FactoryOpts): ProjectDocSink {
  if (isNotionEnabled()) return new NotionProjectDoc();
  return new LocalMarkdownProjectDoc(opts.localRootDir);
}
