import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeAction, supabase, isDbEnabled } from '@wall-a/core';
import { keyFromRequest, lookupKey, hashKey } from '../../../../lib/agent-keys';

const ExecuteSchema = z.object({
  actionId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const rawKey = keyFromRequest(req);
    const who = await lookupKey(rawKey);
    if (!who) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });

    const parsed = ExecuteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });

    // RATE LIMITING & LOOP DETECTION
    if (isDbEnabled && supabase) {
      const keyHash = hashKey(rawKey!);
      const { data: rl, error: rlError } = await supabase.rpc('check_and_log_rate_limit', {
        p_key_hash: keyHash,
        p_action_name: 'execute',
      });

      if (rlError) {
        console.error('Rate limit RPC error:', rlError);
        return NextResponse.json({ error: 'Internal security check failed' }, { status: 500 }); // Fail closed
      }
      if (rl && !rl.allowed) {
        return NextResponse.json({ error: rl.reason }, { status: 429 });
      }
    }

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
