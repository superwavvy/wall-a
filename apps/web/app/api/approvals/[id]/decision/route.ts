import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { decideApproval } from '@wall-a/core';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // no token configured = nobody gets in
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || !['APPROVE', 'REJECT'].includes(body.decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }

    const result = await decideApproval(id, body.decision);
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    const message = status === 500 ? 'Internal error' : error.message;
    return NextResponse.json({ error: message }, { status });
  }
}
