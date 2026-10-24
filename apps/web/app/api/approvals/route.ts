import { NextResponse } from 'next/server';
import { getRecentActions } from '@wall-a/core';

export async function GET() {
  const actions = await getRecentActions();
  return NextResponse.json(actions);
}
