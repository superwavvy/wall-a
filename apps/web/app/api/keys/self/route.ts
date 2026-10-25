import { NextResponse } from 'next/server';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../../lib/client-id';
import { hashKey, newKey } from '../../../../lib/agent-keys';

// Visitors get a safe set only. Riskier tools need an admin-made key.
const SELF_PERMISSIONS = ['send_email', 'fetch_url', 'read_file'];
const MAX_ACTIVE_PER_WORKSPACE = 3;
const MAX_NEW_PER_HOUR_GLOBAL = 200;

export async function POST(req: Request) {
  try {
    const clientId = getClientId(req);
    if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
    if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const mine = await supabase
      .from('agent_keys').select('id', { count: 'exact', head: true })
      .eq('client_id', clientId).eq('source', 'self').is('revoked_at', null);
    if (mine.error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    if ((mine.count ?? 0) >= MAX_ACTIVE_PER_WORKSPACE) {
      return NextResponse.json({ error: 'Key limit reached for this workspace.' }, { status: 429 });
    }

    const since = new Date(Date.now() - 3600_000).toISOString();
    const recent = await supabase
      .from('agent_keys').select('id', { count: 'exact', head: true })
      .eq('source', 'self').gte('created_at', since);
    if (recent.error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    if ((recent.count ?? 0) >= MAX_NEW_PER_HOUR_GLOBAL) {
      return NextResponse.json({ error: 'Too many new keys right now. Try again later.' }, { status: 429 });
    }

    const key = newKey();
    const agentId = `my-agent-${(mine.count ?? 0) + 1}`;
    const ins = await supabase.from('agent_keys').insert({
      key_hash: hashKey(key),
      client_id: clientId,
      agent_id: agentId,
      permissions: SELF_PERMISSIONS,
      label: 'self-service',
      source: 'self',
    });
    if (ins.error) return NextResponse.json({ error: 'Could not create key' }, { status: 500 });

    // The only time the raw key is ever shown.
    return NextResponse.json({ key, agentId, permissions: SELF_PERMISSIONS });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
