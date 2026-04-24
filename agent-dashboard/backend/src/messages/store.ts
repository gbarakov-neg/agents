import type { Message } from './types';

export class NotFoundError extends Error {}
export class AlreadyResolvedError extends Error {}
export class InvalidItemsError extends Error {}

export class MessageStore {
  private byTeam = new Map<string, Message[]>();

  append(teamId: string, msg: Message): void {
    if (!this.byTeam.has(teamId)) this.byTeam.set(teamId, []);
    this.byTeam.get(teamId)!.push(msg);
  }

  get(teamId: string): Message[] {
    return this.byTeam.get(teamId) ?? [];
  }

  findById(teamId: string, msgId: string): Message | undefined {
    return this.byTeam.get(teamId)?.find(m => m.id === msgId);
  }

  applyApproval(teamId: string, msgId: string, itemIds: string[]): Message {
    const msg = this.findById(teamId, msgId);
    if (!msg || msg.kind !== 'plan_proposal') {
      throw new NotFoundError(`plan_proposal ${msgId} not found for team ${teamId}`);
    }
    if (msg.approval !== 'pending') {
      throw new AlreadyResolvedError(`already ${msg.approval}`);
    }
    const validIds = new Set(msg.items.map(i => i.id));
    for (const id of itemIds) {
      if (!validIds.has(id)) throw new InvalidItemsError(`unknown item ${id}`);
    }
    msg.approvedItemIds = [...itemIds];
    msg.approval = itemIds.length === 0 ? 'declined' : 'approved';
    return msg;
  }

  // Snapshot for persistence
  snapshot(): Record<string, Message[]> {
    const out: Record<string, Message[]> = {};
    for (const [k, v] of this.byTeam) out[k] = [...v];
    return out;
  }

  loadSnapshot(data: Record<string, Message[]>): void {
    this.byTeam.clear();
    for (const [k, v] of Object.entries(data)) this.byTeam.set(k, [...v]);
  }
}
