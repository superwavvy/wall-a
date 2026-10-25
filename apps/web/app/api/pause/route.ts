import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../lib/client-id';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const { data, error } = await supabase.from('workspaces').select('paused').eq('client_id', clientId).maybeSingle();
  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  return NextResponse.json({ paused: !!data?.paused });
}

export async function PUT(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const parsed = z.object({ paused: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { error } = await supabase
    .from('workspaces')
    .upsert({ client_id: clientId, paused: parsed.data.paused, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  return NextResponse.json({ paused: parsed.data.paused });
}
