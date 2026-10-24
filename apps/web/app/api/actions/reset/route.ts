import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabase, isDbEnabled } from '@wall-a/core';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDbEnabled) {
    // In-memory mode: restart the dev server to reset.
    return NextResponse.json({ success: true, mode: 'memory' });
  }

  const a = await supabase!.from('actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const l = await supabase!.from('audit_logs').delete().neq('id', -1);
  const g = await supabase!.from('agents').delete().neq('id', 'none');

  if (a.error || l.error || g.error) {
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, mode: 'database' });
}
