import { NextResponse } from 'next/server';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../../../lib/client-id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const { data, error } = await supabase
    .from('agent_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id).eq('client_id', clientId).eq('source', 'self').is('revoked_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Key not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
