import { Client } from '@notionhq/client';

let notion: Client | null = null;
let databaseId: string | null = null;

export function initNotion(token?: string, dbId?: string) {
  if (token) {
    notion = new Client({ auth: token });
    databaseId = dbId || null;
    console.log('Notion integration enabled');
  }
}

export function isNotionEnabled(): boolean {
  return notion !== null && databaseId !== null;
}

// Create a top-level task page for an instruction
export async function createTaskTicket(params: {
  title: string;
  teamName: string;
  projectName: string;
  instruction: string;
  agents: string[];
}): Promise<string | null> {
  if (!notion || !databaseId) return null;
  try {
    const page = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        'Name': { title: [{ text: { content: params.title } }] },
        'Status': { select: { name: 'In Progress' } },
        'Team': { rich_text: [{ text: { content: params.teamName } }] },
        'Project': { rich_text: [{ text: { content: params.projectName } }] },
      },
      children: [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: 'Instruction' } }] }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: params.instruction } }] }
        },
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: 'Agents' } }] }
        },
        ...params.agents.map(agent => ({
          object: 'block' as const,
          type: 'to_do' as const,
          to_do: {
            rich_text: [{ type: 'text' as const, text: { content: agent } }],
            checked: false
          }
        })),
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ type: 'text', text: { content: 'Agent Reports' } }] }
        },
      ]
    });
    return page.id;
  } catch (err) {
    console.error('Notion: failed to create ticket:', err);
    return null;
  }
}

// Update ticket status
export async function updateTicketStatus(pageId: string, status: string): Promise<void> {
  if (!notion) return;
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Status': { select: { name: status } },
      }
    });
  } catch (err) {
    console.error('Notion: failed to update status:', err);
  }
}

// Append an agent report to the ticket
export async function appendAgentReport(pageId: string, report: {
  agentName: string;
  role: string;
  task: string;
  status: string;
  output: string;
  filesChanged: string[];
  reasoning: string;
}): Promise<void> {
  if (!notion) return;
  try {
    const blocks: any[] = [
      {
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ type: 'text', text: { content: `${report.agentName} (${report.role})` } }] }
      },
      {
        object: 'block',
        type: 'callout',
        callout: {
          icon: { emoji: report.status === 'complete' ? '✅' : '❌' },
          rich_text: [{ type: 'text', text: { content: `Status: ${report.status}` } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [
          { type: 'text', text: { content: 'Task: ', annotations: { bold: true } } },
          { type: 'text', text: { content: report.task } }
        ] }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [
          { type: 'text', text: { content: 'Reasoning: ', annotations: { bold: true } } },
          { type: 'text', text: { content: report.reasoning } }
        ] }
      },
    ];

    if (report.filesChanged.length > 0) {
      blocks.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [
          { type: 'text', text: { content: `Files changed (${report.filesChanged.length}):`, annotations: { bold: true } } }
        ] }
      });
      blocks.push({
        object: 'block',
        type: 'code',
        code: {
          language: 'plain text',
          rich_text: [{ type: 'text', text: { content: report.filesChanged.join('\n') } }]
        }
      });
    }

    if (report.output) {
      blocks.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{ type: 'text', text: { content: 'Full Output' } }],
          children: [{
            object: 'block',
            type: 'code',
            code: {
              language: 'plain text',
              rich_text: [{ type: 'text', text: { content: report.output.substring(0, 1900) } }]
            }
          }]
        }
      });
    }

    blocks.push({ object: 'block', type: 'divider', divider: {} });

    await notion.blocks.children.append({ block_id: pageId, children: blocks });
  } catch (err) {
    console.error('Notion: failed to append report:', err);
  }
}

// Mark agent checkbox as done
export async function checkAgentTodo(pageId: string, agentName: string): Promise<void> {
  if (!notion) return;
  try {
    const children = await notion.blocks.children.list({ block_id: pageId });
    for (const block of children.results) {
      if ('type' in block && block.type === 'to_do' && 'to_do' in block) {
        const text = (block.to_do as any).rich_text?.[0]?.text?.content;
        if (text === agentName) {
          await notion.blocks.update({
            block_id: block.id,
            to_do: { checked: true, rich_text: (block.to_do as any).rich_text }
          });
          break;
        }
      }
    }
  } catch (err) {
    console.error('Notion: failed to check todo:', err);
  }
}
