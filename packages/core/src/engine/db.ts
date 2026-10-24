import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isDbEnabled = !!(supabaseUrl && supabaseKey);

export const supabase = isDbEnabled 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// In-memory fallback for local testing without Supabase
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
