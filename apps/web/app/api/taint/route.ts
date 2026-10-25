import { NextResponse } from 'next/server';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../lib/client-id';

export const dynamic = 'force-dynamic';

// Taint rows are keyed "<workspace>::<agent>[::<session>]". "_" is a LIKE wildcard,
// so we over-match in SQL, then keep only rows that truly start with our prefix.
async function taintedIds(clientId: string, onlyTainted: boolean) {
  const prefix = `${clientId}::`;
  const { data, error } = await supabase!.from('agents').select('id, tainted').like('id', `${prefix}%`);
  if (error) throw new Error('db');
  return (data ?? []).filter((r: any) => r.id.startsWith(prefix) && (!onlyTainted || r.tainted)).map((r: any) => r.id as string);
}

export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  try {
    return NextResponse.json({ tainted: (await taintedIds(clientId, true)).length });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  try {
    const ids = await taintedIds(clientId, true);
    if (ids.length) {
      const { error } = await supabase.from('agents').update({ tainted: false }).in('id', ids);
      if (error) throw new Error('db');
    }
    return NextResponse.json({ success: true, cleared: ids.length });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
