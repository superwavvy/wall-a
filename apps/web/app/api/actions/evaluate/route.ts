import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateAction, supabase, isDbEnabled } from '@wall-a/core';
import { keyFromRequest, lookupKey, hashKey } from '../../../../lib/agent-keys';

const EvaluateSchema = z.object({
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  action: z.object({
    toolName: z.string().min(1).max(64),
    parameters: z.record(z.string(), z.any()),
  }),
});

export async function POST(req: Request) {
  try {
    const rawKey = keyFromRequest(req);
    const who = await lookupKey(rawKey);
    if (!who) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });

    const parsed = EvaluateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });

    const { sessionId, action } = parsed.data;

    // RATE LIMITING & LOOP DETECTION
    if (isDbEnabled && supabase) {
      const keyHash = hashKey(rawKey!);
      const { data: rl, error: rlError } = await supabase.rpc('check_and_log_rate_limit', {
        p_key_hash: keyHash,
        p_action_name: action.toolName,
      });

      if (rlError) {
        console.error('Rate limit RPC error:', rlError);
        return NextResponse.json({ error: 'Internal security check failed' }, { status: 500 }); // Fail closed
      }
      if (rl && !rl.allowed) {
        return NextResponse.json({ error: rl.reason }, { status: 429 });
      }
    }

    const result = await evaluateAction(
      { agentId: who.agentId, permissions: who.permissions, tainted: false, sessionId } as any,
      action,
      who.clientId
    );
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json({ error: status === 500 ? 'Internal Engine Error' : error.message }, { status });
  }
}
