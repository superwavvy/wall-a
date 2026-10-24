#!/usr/bin/env bash
set -e
cd ~/wall-a

# 1. Fix db.ts
cat > packages/core/src/engine/db.ts << 'EOF_DB'
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isDbEnabled = !!(supabaseUrl && supabaseKey);

if (!isDbEnabled && process.env.NODE_ENV === 'production') {
  console.warn('WALL-A: no database configured. Falling back to in-memory storage, which does not persist on serverless.');
}

export const supabase = isDbEnabled
  ? createClient(supabaseUrl as string, supabaseKey as string, { auth: { persistSession: false } })
  : null;

const globalForDb = globalThis as unknown as {
  actionMemory: Map<string, any>,
  agentMemory: Map<string, any>,
  auditMemory: any[],
  seqCounter: number
};

export const actionMemory = globalForDb.actionMemory || new Map();
export const agentMemory = globalForDb.agentMemory || new Map();
export const auditMemory = globalForDb.auditMemory || [];
export let seqCounter = globalForDb.seqCounter || 0;

if (process.env.NODE_ENV !== 'production') {
  globalForDb.actionMemory = actionMemory;
  globalForDb.agentMemory = agentMemory;
  globalForDb.auditMemory = auditMemory;
  globalForDb.seqCounter = seqCounter;
}

export function incrementSeq() {
  seqCounter++;
  globalForDb.seqCounter = seqCounter;
  return seqCounter;
}
EOF_DB
# 2. Fix audit.ts
cat > packages/core/src/engine/audit.ts << 'EOF_AUDIT'
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

function hashEntry(e: { index: number; timestamp: string; actionId: string; event: string; data: any; prevHash: string }): string {
  return generateHash(
    stable({
      index: e.index,
      timestamp: e.timestamp,
      actionId: e.actionId,
      event: e.event,
      data: e.data,
      prevHash: e.prevHash,
    })
  );
}

function build(index: number, timestamp: string, actionId: string, event: string, data: any, prevHash: string): AuditLog {
  const entryHash = hashEntry({ index, timestamp, actionId, event, data, prevHash });
  return { index, timestamp, actionId, event, data, prevHash, entryHash };
}

class AuditChain {
  async getLastEntry(): Promise<{ index: number; entryHash: string } | null> {
    if (isDbEnabled) {
      const { data, error } = await supabase!
        .from('audit_logs')
        .select('index, entry_hash')
        .order('index', { ascending: false })
        .limit(1);
      if (error) throw new Error('Audit read failed'); 
      if (!data || data.length === 0) return null;
      return { index: Number(data[0].index), entryHash: data[0].entry_hash };
    }
    const last = auditMemory[auditMemory.length - 1];
    return last ? { index: last.index, entryHash: last.entryHash } : null;
  }

  async log(event: string, actionId: string, data: any): Promise<AuditLog> {
    const timestamp = new Date().toISOString();

    if (!isDbEnabled) {
      const last = auditMemory[auditMemory.length - 1];
      const entry = build(last ? last.index + 1 : 0, timestamp, actionId, event, data, last ? last.entryHash : GENESIS);
      auditMemory.push(entry);
      return entry;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      const last = await this.getLastEntry();
      const entry = build(last ? last.index + 1 : 0, timestamp, actionId, event, data, last ? last.entryHash : GENESIS);

      const { error } = await supabase!.from('audit_logs').insert({
        index: entry.index,
        timestamp: entry.timestamp,
        action_id: entry.actionId,
        event: entry.event,
        data: entry.data,
        prev_hash: entry.prevHash,
        entry_hash: entry.entryHash,
      });

      if (!error) return entry;
      if ((error as any).code !== '23505') throw new Error('Audit write failed'); 
      await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
    throw new Error('Audit write failed (too much contention)');
  }

  async verifyChain(): Promise<boolean> {
    let rows: AuditLog[] = [];

    if (isDbEnabled) {
      const { data, error } = await supabase!
        .from('audit_logs')
        .select('*')
        .order('index', { ascending: true })
        .limit(10000);
      if (error) return false;
      rows = (data || []).map((l: any) => ({
        index: Number(l.index),
        timestamp: new Date(l.timestamp).toISOString(),
        actionId: l.action_id,
        event: l.event,
        data: l.data,
        prevHash: l.prev_hash,
        entryHash: l.entry_hash,
      }));
    } else {
      rows = auditMemory as AuditLog[];
    }

    for (let i = 0; i < rows.length; i++) {
      const cur = rows[i];
      if (i === 0 && cur.index !== 0) return false; 
      if (i > 0 && cur.index !== rows[i - 1].index + 1) return false; 
      const expectedPrev = i === 0 ? GENESIS : rows[i - 1].entryHash;
      if (cur.prevHash !== expectedPrev) return false;
      if (hashEntry(cur) !== cur.entryHash) return false;
    }
    return true;
  }

  async getLogs() {
    if (isDbEnabled) {
      const { data, error } = await supabase!
        .from('audit_logs')
        .select('*')
        .order('index', { ascending: false })
        .limit(20);
      if (error) {
        console.error('Audit read failed');
        return [];
      }
      return (data || []).map((l: any) => ({
        index: l.index,
        timestamp: l.timestamp,
        actionId: l.action_id,
        event: l.event,
        data: l.data,
        prevHash: l.prev_hash,
        entryHash: l.entry_hash,
      }));
    }
    return auditMemory.slice(-20).reverse();
  }
}

export const auditLogger = new AuditChain();
EOF_AUDIT

echo "1) service key used in db.ts (expect 1+):"
grep -c "SUPABASE_SERVICE_ROLE_KEY" packages/core/src/engine/db.ts || true
echo "2) any ANON key left in the code (expect nothing):"
grep -rn "ANON_KEY" apps packages --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next || true
