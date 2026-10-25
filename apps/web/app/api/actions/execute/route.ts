import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeAction } from '@wall-a/core';

const ExecuteSchema = z.object({
  agentId: z.string().min(1).max(64),
  actionId: z.string().uuid(),
});

const ClientIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(req: Request) {
  try {
    const clientId = ClientIdSchema.safeParse(req.headers.get('x-client-id'));
    if (!clientId.success) {
      return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = ExecuteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
    }

    const { agentId, actionId } = parsed.data;
    const result = await executeAction(agentId, actionId, { clientId: clientId.data });
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: status === 500 ? 'Internal error' : error.message },
      { status }
    );
  }
}
