import { NextResponse } from 'next/server';
import { getRecentActions } from '@wall-a/core';
import { getClientId } from '../../../lib/client-id';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const clientId = getClientId(req);
    if (!clientId) {
      return NextResponse.json({ error: 'Missing or invalid x-client-id' }, { status: 400 });
    }
    const actions = await getRecentActions(clientId);
    return NextResponse.json(actions);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json({ error: status === 500 ? 'Internal error' : error.message }, { status });
  }
}
