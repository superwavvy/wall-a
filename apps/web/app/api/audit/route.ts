import { NextResponse } from 'next/server';
import { auditLogger } from '@wall-a/core';
import { getClientId } from '../../../lib/client-id';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = getClientId(req);
  if (!clientId) {
    return NextResponse.json({ isValid: false, logs: [], error: 'Missing or invalid x-client-id' }, { status: 400 });
  }
  try {
    const logs = await auditLogger.getLogs(clientId);
    const isValid = await auditLogger.verifyChain(clientId);
    return NextResponse.json({ isValid, logs });
  } catch {
    // If anything fails, never claim the chain is fine.
    return NextResponse.json({ isValid: false, logs: [] }, { status: 500 });
  }
}
