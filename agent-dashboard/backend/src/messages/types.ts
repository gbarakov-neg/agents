export type Priority = 'high' | 'medium' | 'low';

export type PlanItemKind = 'work' | 'add_agent';

export interface PlanProposalItem {
  id: string;
  title: string;
  detail?: string;
  priority: Priority;
  suggestedAgent?: string;
  kind?: PlanItemKind;
}

export type ExecutionStatus = 'started' | 'progress' | 'completed' | 'failed';
export type Approval = 'pending' | 'approved' | 'declined';

export type Message =
  | {
      id: string; role: 'user' | 'assistant'; kind: 'text';
      content: string; createdAt: string;
    }
  | {
      id: string; role: 'assistant'; kind: 'plan_proposal';
      summary: string;
      items: PlanProposalItem[];
      approval: Approval;
      approvedItemIds?: string[];
      createdAt: string;
    }
  | {
      id: string; role: 'system'; kind: 'execution_status';
      planMessageId: string;
      phase: string;
      agentId?: string;
      status: ExecutionStatus;
      detail?: string;
      createdAt: string;
    };
