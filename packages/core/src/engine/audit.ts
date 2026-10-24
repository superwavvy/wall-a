import { generateHash } from './crypto';
import { supabase, isDbEnabled, auditMemory } from './db';

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
  async getLastEntry() {
    if (isDbEnabled) {
      // FIX: Don't use .single(), use array and check length
      const { data, error } = await supabase!.from('audit_logs').select('*').order('index', { ascending: false }).limit(1);
      if (error) {
        console.error("Supabase Audit Error:", error);
        return null;
      }
      return data && data.length > 0 ? data[0] : null;
    }
    return auditMemory[auditMemory.length - 1];
  }

  async log(event: string, actionId: string, data: any) {
    const prev = await this.getLastEntry();
    const index = prev ? prev.index + 1 : 0;
    const prevHash = prev ? prev.entryHash : '0'.repeat(64);
    
    const newEntry: AuditLog = {
      index,
      timestamp: new Date().toISOString(),
      actionId,
      event,
      data,
      prevHash,
      entryHash: ''
    };

    const hashPayload = { ...newEntry };
    delete (hashPayload as any).entryHash;
    newEntry.entryHash = generateHash(hashPayload);
    
    if (isDbEnabled) {
      await supabase!.from('audit_logs').insert({
        index: newEntry.index,
        timestamp: newEntry.timestamp,
        action_id: newEntry.actionId,
        event: newEntry.event,
        data: newEntry.data,
        prev_hash: newEntry.prevHash,
        entry_hash: newEntry.entryHash
      });
    } else {
      auditMemory.push(newEntry);
    }
    
    return newEntry;
  }

  async verifyChain(): Promise<boolean> {
    let logs: any[] = [];
    if (isDbEnabled) {
      const { data } = await supabase!.from('audit_logs').select('*').order('index', { ascending: true });
      logs = data || [];
    } else {
      logs = auditMemory;
    }

    for (let i = 1; i < logs.length; i++) {
      const current = logs[i];
      const prev = logs[i - 1];
      
      const currentPrevHash = isDbEnabled ? current.prev_hash : current.prevHash;
      const prevEntryHash = isDbEnabled ? prev.entry_hash : prev.entryHash;
      const currentEntryHash = isDbEnabled ? current.entry_hash : current.entryHash;
      
      if (currentPrevHash !== prevEntryHash) return false;

      const hashPayload = {
        index: current.index,
        timestamp: current.timestamp,
        actionId: isDbEnabled ? current.action_id : current.actionId,
        event: current.event,
        data: current.data,
        prevHash: currentPrevHash
      };
      
      if (generateHash(hashPayload) !== currentEntryHash) return false;
    }
    return true;
  }

  async getLogs() {
    if (isDbEnabled) {
      const { data } = await supabase!.from('audit_logs').select('*').order('index', { ascending: false }).limit(20);
      return (data || []).map(l => ({ index: l.index, timestamp: l.timestamp, actionId: l.action_id, event: l.event, data: l.data, prevHash: l.prev_hash, entryHash: l.entry_hash }));
    }
    return auditMemory.slice(-20).reverse();
  }
}

export const auditLogger = new AuditChain();
