import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeAction } from '@wall-a/core';
import { keyFromRequest, lookupKey } from '../../../../lib/agent-keys';

// Only the action id comes from the body. Identity comes from the key.
const ExecuteSchema = z.object({
  actionId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const who = await lookupKey(keyFromRequest(req));
    if (!who) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });

    const parsed = ExecuteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });

    const result = await executeAction(who.agentId, parsed.data.actionId, { clientId: who.clientId });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: status === 500 ? 'Internal error' : error.message },
      { status }
    );
  }
}
