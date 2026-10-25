import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateAction } from '@wall-a/core';
import { getClientId } from '../../../../lib/client-id';

const EvaluateSchema = z.object({
  agentId: z.string().min(1).max(64),
  permissions: z.array(z.string().max(64)).max(32),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  action: z.object({
    toolName: z.string().min(1).max(64),
    parameters: z.record(z.string(), z.any()),
  }),
});

export async function POST(req: Request) {
  try {
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = EvaluateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
    }

    // Any "tainted" field in the body is ignored. Taint comes from the session.
    const { agentId, permissions, sessionId, action } = parsed.data;
    const result = await evaluateAction({ agentId, permissions, tainted: false, sessionId } as any, action, clientId);
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json(
      { error: status === 500 ? 'Internal Engine Error' : error.message },
      { status }
    );
  }
}
