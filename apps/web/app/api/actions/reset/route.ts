import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabase, isDbEnabled, resetWorkspace, actionMemory, agentMemory, auditMemory } from '@wall-a/core';
import { getClientId } from '../../../../lib/client-id';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // no token configured = nobody gets in
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scope = new URL(req.url).searchParams.get('scope');

    // scope=all wipes EVERY workspace. Admin only.
    if (scope === 'all') {
      if (!isDbEnabled) {
        actionMemory.clear();
        agentMemory.clear();
        auditMemory.length = 0;
        (globalThis as any).__wallaFiles?.clear();
        return NextResponse.json({ success: true, mode: 'memory', scope: 'all' });
      }
      const a = await supabase!.from('actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const l = await supabase!.from('audit_logs').delete().gte('index', 0);
      const g = await supabase!.from('agents').delete().neq('id', 'none');
      const w = await supabase!.from('workspace_files').delete().neq('client_id', '');
      if (a.error || l.error || g.error || w.error) {
        return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
      }
      return NextResponse.json({ success: true, mode: 'database', scope: 'all' });
    }

    // Default: only the workspace that sent the request.
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
    }
    await resetWorkspace(clientId);
    return NextResponse.json({ success: true, scope: 'workspace' });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json({ error: status === 500 ? 'Internal error' : error.message }, { status });
  }
}
