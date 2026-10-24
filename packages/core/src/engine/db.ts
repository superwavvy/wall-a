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
