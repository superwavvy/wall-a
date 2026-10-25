import { generateHash } from './crypto';
import { supabase, isDbEnabled, auditMemory } from './db';

export interface AuditLog {
  index: number; timestamp: string; actionId: string; event: string; data: any; prevHash: string; entryHash: string; clientId?: string;
}

const GENESIS = '0'.repeat(64);

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out: any = {};
    for (const k of Object.keys(value).sort()) out[k] = stable(value[k]);
    return out;
  }
  return value;
}

function hashEntry(e: { clientId: string; index: number; timestamp: string; actionId: string; event: string; data: any; prevHash: string }): string {
  return generateHash(stable({ clientId: e.clientId, index: e.index, timestamp: e.timestamp, actionId: e.actionId, event: e.event, data: e.data, prevHash: e.prevHash }));
}

function build(clientId: string, index: number, timestamp: string, actionId: string, event: string, data: any, prevHash: string): AuditLog {
  const entryHash = hashEntry({ clientId, index, timestamp, actionId, event, data, prevHash });
  return { clientId, index, timestamp, actionId, event, data, prevHash, entryHash };
}

function memoryChain(clientId: string): any[] {
  return (auditMemory as any[]).filter((e) => e.clientId === clientId);
}

class AuditChain {
  async getLastEntry(clientId: string): Promise<{ index: number; entryHash: string } | null> {
    if (isDbEnabled) {
      const { data, error } = await supabase!.from('audit_logs').select('index, entry_hash').eq('client_id', clientId).order('index', { ascending: false }).limit(1);
      if (error) throw new Error('Audit read failed');
      if (!data || data.length === 0) return null;
      return { index: Number(data[0].index), entryHash: data[0].entry_hash };
    }
    const mine = memoryChain(clientId);
    const last = mine[mine.length - 1];
    return last ? { index: last.index, entryHash: last.entryHash } : null;
  }

  async log(event: string, actionId: string, data: any, clientId: string = 'default'): Promise<AuditLog> {
    const timestamp = new Date().toISOString();

    if (!isDbEnabled) {
      const mine = memoryChain(clientId);
      const last = mine[mine.length - 1];
      const entry = build(clientId, last ? last.index + 1 : 0, timestamp, actionId, event, data, last ? last.entryHash : GENESIS);
      auditMemory.push(entry);
      return entry;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      const last = await this.getLastEntry(clientId);
      const entry = build(clientId, last ? last.index + 1 : 0, timestamp, actionId, event, data, last ? last.entryHash : GENESIS);

      const { error } = await supabase!.from('audit_logs').insert({
        client_id: clientId, index: entry.index, timestamp: entry.timestamp, action_id: entry.actionId,
        event: entry.event, data: entry.data, prev_hash: entry.prevHash, entry_hash: entry.entryHash,
      });

      if (!error) return entry;
      if ((error as any).code !== '23505') throw new Error('Audit write failed');
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
    throw new Error('Audit write failed (too much contention)');
  }

  async verifyChain(clientId?: string): Promise<boolean> {
    let rows: any[] = [];

    if (isDbEnabled) {
      let q: any = supabase!.from('audit_logs').select('*').order('client_id', { ascending: true }).order('index', { ascending: true }).limit(10000);
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) return false;
      rows = (data || []).map((l: any) => ({
        clientId: l.client_id, index: Number(l.index), timestamp: new Date(l.timestamp).toISOString(),
        actionId: l.action_id, event: l.event, data: l.data, prevHash: l.prev_hash, entryHash: l.entry_hash,
      }));
    } else {
      rows = (auditMemory as any[]).filter((e) => !clientId || e.clientId === clientId);
    }

    const chains = new Map<string, any[]>();
    for (const r of rows) {
      const k = r.clientId ?? 'default';
      if (!chains.has(k)) chains.set(k, []);
      chains.get(k)!.push(r);
    }

    for (const [k, chain] of chains) {
      chain.sort((a, b) => a.index - b.index);
      for (let i = 0; i < chain.length; i++) {
        const cur = chain[i];
        if (i === 0 && cur.index !== 0) return false;
        if (i > 0 && cur.index !== chain[i - 1].index + 1) return false;
        const expectedPrev = i === 0 ? GENESIS : chain[i - 1].entryHash;
        if (cur.prevHash !== expectedPrev) return false;
        if (hashEntry({ ...cur, clientId: k }) !== cur.entryHash) return false;
      }
    }
    return true;
  }

  async getLogs(clientId: string = 'default') {
    if (isDbEnabled) {
      const { data, error } = await supabase!.from('audit_logs').select('*').eq('client_id', clientId).order('index', { ascending: false }).limit(20);
      if (error) { console.error('Audit read failed'); return []; }
      return (data || []).map((l: any) => ({
        index: l.index, timestamp: l.timestamp, actionId: l.action_id, event: l.event, data: l.data, prevHash: l.prev_hash, entryHash: l.entry_hash,
      }));
    }
    return memoryChain(clientId).slice(-20).reverse();
  }
}

export const auditLogger = new AuditChain();
