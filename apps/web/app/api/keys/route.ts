import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { supabase, isDbEnabled } from '@wall-a/core';
import { getClientId } from '../../../lib/client-id';
import { hashKey, newKey } from '../../../lib/agent-keys';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

const Body = z.object({
  agentId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  permissions: z.array(z.enum(['send_email', 'fetch_url', 'read_file', 'write_file', 'db_query', 'delete_resource'])).max(6),
  label: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const clientId = getClientId(req);
  if (!clientId) return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (!isDbEnabled || !supabase) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const key = newKey();
  const { error } = await supabase.from('agent_keys').insert({
    key_hash: hashKey(key),
    client_id: clientId,
    agent_id: parsed.data.agentId,
    permissions: parsed.data.permissions,
    label: parsed.data.label ?? null,
  });
  if (error) return NextResponse.json({ error: 'Could not create key' }, { status: 500 });
  // The only time the raw key is ever shown.
  return NextResponse.json({ key, agentId: parsed.data.agentId, permissions: parsed.data.permissions });
}
