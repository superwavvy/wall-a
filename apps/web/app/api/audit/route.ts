import { NextResponse } from 'next/server';
import { auditLogger } from '@wall-a/core';

export async function GET() {
  const logs = await auditLogger.getLogs();
  const isValid = await auditLogger.verifyChain();
  return NextResponse.json({ isValid, logs });
}
