import { NextResponse } from 'next/server';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../../lib/client-id';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const { data, error } = await supabase
    .from('agent_keys')
    .select('id, agent_id, permissions, created_at, last_used_at')
    .eq('client_id', clientId).eq('source', 'self').is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  return NextResponse.json({ keys: data });
}
