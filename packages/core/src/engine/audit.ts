import { generateHash } from './crypto';

export interface AuditLog {
  index: number;
  timestamp: string;
  actionId: string;
  event: string;
  data: any;
  prevHash: string;
  entryHash: string;
}

class AuditChain {
  private chain: AuditLog[] = [];

  constructor() {
    this.chain.push({
      index: 0,
      timestamp: new Date().toISOString(),
      actionId: 'genesis',
      event: 'INIT',
      data: {},
      prevHash: '0'.repeat(64),
      entryHash: generateHash({ genesis: true })
    });
  }

  log(event: string, actionId: string, data: any) {
    const prev = this.chain[this.chain.length - 1];
    const newEntry: AuditLog = {
      index: prev.index + 1,
      timestamp: new Date().toISOString(),
      actionId,
      event,
      data,
      prevHash: prev.entryHash,
      entryHash: ''
    };

    const hashPayload = {
      index: newEntry.index,
      timestamp: newEntry.timestamp,
      actionId: newEntry.actionId,
      event: newEntry.event,
      data: newEntry.data,
      prevHash: newEntry.prevHash
    };
    
    newEntry.entryHash = generateHash(hashPayload);
    this.chain.push(newEntry);
    return newEntry;
  }

  verifyChain(): boolean {
    for (let i = 1; i < this.chain.length; i++) {
      const current = this.chain[i];
      const prev = this.chain[i - 1];

      if (current.prevHash !== prev.entryHash) return false;

      const hashPayload = {
        index: current.index,
        timestamp: current.timestamp,
        actionId: current.actionId,
        event: current.event,
        data: current.data,
        prevHash: current.prevHash
      };
      if (generateHash(hashPayload) !== current.entryHash) return false;
    }
    return true;
  }

  getLogs() {
    return this.chain;
  }
}

// SURVIVE HOT RELOADS
const globalForAudit = globalThis as unknown as { auditLogger: AuditChain };
export const auditLogger = globalForAudit.auditLogger || new AuditChain();
if (process.env.NODE_ENV !== 'production') globalForAudit.auditLogger = auditLogger;
