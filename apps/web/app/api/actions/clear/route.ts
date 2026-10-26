import { NextResponse } from 'next/server';
import { supabase, isDbEnabled, actionMemory } from '@wall-a/core';

export async function DELETE(req: Request) {
  const clientId = req.headers.get('x-client-id') || 'default';

  try {
    if (isDbEnabled) {
      const { error } = await supabase!.from('actions').delete().eq('client_id', clientId);
      if (error) throw error;
    } else {
      for (const [id, a] of Array.from(actionMemory.entries())) {
        if ((a as any).clientId === clientId) actionMemory.delete(id);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
