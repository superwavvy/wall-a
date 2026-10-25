import { createHash, randomBytes } from 'node:crypto';
import { supabase, isDbEnabled } from '@wall-a/core';

export const hashKey = (k: string) => createHash('sha256').update(k).digest('hex');
export const newKey = () => 'wa_' + randomBytes(24).toString('base64url');

// Accepts "Authorization: Bearer wa_..." or "?key=wa_..." (for connectors that can't set headers).
export function keyFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return new URL(req.url).searchParams.get('key');
}

// Returns the agent's identity from the database, or null. Fails closed.
export async function lookupKey(raw: string | null) {
  if (!raw || !/^wa_[A-Za-z0-9_-]{20,64}$/.test(raw)) return null;
  if (!isDbEnabled || !supabase) return null;
  const { data, error } = await supabase
    .from('agent_keys')
    .select('id, client_id, agent_id, permissions, revoked_at, last_used_at')
    .eq('key_hash', hashKey(raw))
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;

  // Record "last used" at most once a minute. Best effort: a failure never blocks the call.
  const last = data.last_used_at ? new Date(data.last_used_at).getTime() : 0;
  if (Date.now() - last > 60_000) {
    try { await supabase.from('agent_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id); } catch {}
  }
  return { clientId: data.client_id as string, agentId: data.agent_id as string, permissions: data.permissions as string[] };
}
