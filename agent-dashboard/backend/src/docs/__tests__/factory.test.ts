import { describe, it, expect, vi } from 'vitest';

const { isNotionEnabledMock } = vi.hoisted(() => ({
  isNotionEnabledMock: vi.fn(),
}));

vi.mock('../../../notion.js', () => ({
  createProjectPage: vi.fn(),
  createTaskTicket: vi.fn(),
  updateTicketStatus: vi.fn(),
  appendAgentReport: vi.fn(),
  checkAgentTodo: vi.fn(),
  isNotionEnabled: isNotionEnabledMock,
  initNotion: vi.fn(),
}));

import { resolveProjectDoc } from '../factory';
import { NotionProjectDoc } from '../notionSink';
import { LocalMarkdownProjectDoc } from '../localSink';

describe('resolveProjectDoc', () => {
  it('returns NotionProjectDoc when Notion is enabled', () => {
    isNotionEnabledMock.mockReturnValue(true);
    const sink = resolveProjectDoc({ localRootDir: '/tmp' });
    expect(sink).toBeInstanceOf(NotionProjectDoc);
  });

  it('returns LocalMarkdownProjectDoc when Notion is disabled', () => {
    isNotionEnabledMock.mockReturnValue(false);
    const sink = resolveProjectDoc({ localRootDir: '/tmp' });
    expect(sink).toBeInstanceOf(LocalMarkdownProjectDoc);
  });
});
