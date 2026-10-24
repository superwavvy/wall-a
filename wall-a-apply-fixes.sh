#!/usr/bin/env bash
# WALL-A hardening: rewrites gateway.ts and 3 API routes.
# Run from anywhere: bash wall-a-apply-fixes.sh   (or paste the whole thing into Termux)
set -e
cd ~/wall-a

mkdir -p "apps/web/app/api/approvals/[id]/decision"
mkdir -p "apps/web/app/api/actions/reset"
mkdir -p "apps/web/app/api/demo/approve"

# ---------------------------------------------------------------
# 1. packages/core/src/engine/gateway.ts
# ---------------------------------------------------------------
cat > packages/core/src/engine/gateway.ts << 'EOF_GATEWAY'
import { randomUUID } from 'node:crypto';
import { AgentContext, ActionRequest } from '../types/index';
import { evaluatePolicy } from './policy';
import { calculateRisk } from './risk';
import { generateHash, maskSensitiveData } from './crypto';
import { ToolHandlers } from '../tools/handlers';
import { auditLogger } from './audit';
import { supabase, isDbEnabled, actionMemory, agentMemory, incrementSeq } from './db';

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type StoredAction = {
  id: string;
  agentId: string;
  toolName: string;
  parameters: any;
  paramsHash: string;
  status: string;
  riskScore: number;
  reason: string;
  expiresAt: string;
};

// Session ids are optional. Only safe characters are accepted.
function cleanSessionId(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined;
}

// Taint is tracked per agent + session, so one visitor cannot taint another.
function taintKey(agentId: string, sessionId?: string): string {
  return sessionId ? `${agentId}::${sessionId}` : agentId;
}

async function loadAction(actionId: string): Promise<StoredAction | null> {
  if (!UUID_RE.test(actionId)) return null;

  if (isDbEnabled) {
    const { data, error } = await supabase!.from('actions').select('*').eq('id', actionId).maybeSingle();
    if (error) throw new HttpError('Storage error.', 503);
    if (!data) return null;
    return {
      id: data.id,
      agentId: data.agent_id,
      toolName: data.tool_name,
      parameters: data.parameters,
      paramsHash: data.params_hash,
      status: data.status,
      riskScore: data.risk_score,
      reason: data.reason,
      expiresAt: data.expires_at,
    };
  }

  const a: any = actionMemory.get(actionId);
  if (!a) return null;
  return {
    id: actionId,
    agentId: a.agentId,
    toolName: a.toolName,
    parameters: a.parameters,
    paramsHash: a.paramsHash,
    status: a.status,
    riskScore: a.riskScore,
    reason: a.reason,
    expiresAt: a.expiresAt,
  };
}

// Atomic status change. The UPDATE only matches if the row is still in one of
// the `from` states, so two simultaneous requests cannot both succeed.
async function claim(
  actionId: string,
  from: string[],
  to: string,
  opts: { agentId?: string; notExpired?: boolean } = {}
): Promise<boolean> {
  if (isDbEnabled) {
    let q: any = supabase!.from('actions').update({ status: to }).eq('id', actionId).in('status', from);
    if (opts.agentId) q = q.eq('agent_id', opts.agentId);
    if (opts.notExpired) q = q.gt('expires_at', new Date().toISOString());
    const { data, error } = await q.select('id');
    if (error) throw new HttpError('Storage error.', 503);
    return Array.isArray(data) && data.length === 1;
  }

  // In-memory mode: no await between check and set, so this is atomic too.
  const a: any = actionMemory.get(actionId);
  if (!a || !from.includes(a.status)) return false;
  if (opts.agentId && a.agentId !== opts.agentId) return false;
  if (opts.notExpired && Date.now() > new Date(a.expiresAt).getTime()) return false;
  a.status = to;
  actionMemory.set(actionId, a);
  return true;
}

export async function evaluateAction(agentInput: AgentContext, action: ActionRequest) {
  const sessionId = cleanSessionId((agentInput as any).sessionId);
  const key = taintKey(agentInput.agentId, sessionId);

  // Taint comes from the server, never from the request body.
  let tainted = false;
  if (isDbEnabled) {
    const { data, error } = await supabase!.from('agents').select('tainted').eq('id', key).maybeSingle();
    if (error) tainted = true; // fail closed: if we cannot check, assume tainted
    else if (data) tainted = !!data.tainted;
  } else {
    tainted = !!(agentMemory.get(key) as any)?.tainted;
  }

  const agent = { ...agentInput, tainted };
  const paramsHash = generateHash(action.parameters);

  // Duplicate pending request: return the existing one instead of a new one.
  if (isDbEnabled) {
    const { data: dup } = await supabase!
      .from('actions')
      .select('id, risk_score')
      .eq('agent_id', agent.agentId)
      .eq('tool_name', action.toolName)
      .eq('params_hash', paramsHash)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString())
      .limit(1);
    if (dup && dup.length > 0) {
      return { actionId: dup[0].id, decision: 'PENDING', reason: 'Duplicate request pending.', riskScore: dup[0].risk_score, paramsHash };
    }
  } else {
    for (const [id, existing] of actionMemory.entries()) {
      const e: any = existing;
      if (
        e.agentId === agent.agentId &&
        e.toolName === action.toolName &&
        e.paramsHash === paramsHash &&
        e.status === 'PENDING' &&
        Date.now() <= new Date(e.expiresAt).getTime()
      ) {
        return { actionId: id, decision: e.status, reason: 'Duplicate request pending.', riskScore: e.riskScore, paramsHash };
      }
    }
  }

  const policyResult = evaluatePolicy(agent, action);
  const risk = calculateRisk(agent, action);
  const actionId = randomUUID();

  let initialStatus = 'PENDING';
  if (policyResult.decision === 'ALLOW') initialStatus = 'ALLOWED';
  if (policyResult.decision === 'BLOCK') initialStatus = 'BLOCKED';

  // Only an allowed fetch_url taints the session (a blocked fetch never happened).
  const taintsSession = action.toolName === 'fetch_url' && policyResult.decision === 'ALLOW';
  if (taintsSession) {
    if (isDbEnabled) {
      const { error } = await supabase!.from('agents').upsert({ id: key, tainted: true });
      if (error) throw new HttpError('Could not record session state.', 503); // fail closed
    } else {
      agentMemory.set(key, { tainted: true } as any);
    }
    await auditLogger.log('AGENT_TAINTED', key, { reason: 'Fetched untrusted URL' });
  }

  const row = {
    id: actionId,
    agent_id: agent.agentId,
    tool_name: action.toolName,
    parameters: action.parameters,
    params_hash: paramsHash,
    status: initialStatus,
    risk_score: risk.score,
    reason: taintsSession ? 'Allowed — session now TAINTED' : policyResult.reason,
    expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  };

  if (isDbEnabled) {
    // `sequence` is filled in by the database (see the migration).
    const { error } = await supabase!.from('actions').insert(row);
    if (error) throw new HttpError('Could not record action.', 503);
  } else {
    actionMemory.set(actionId, {
      ...row,
      sequence: incrementSeq(),
      actionId: row.id,
      agentId: row.agent_id,
      toolName: row.tool_name,
      paramsHash: row.params_hash,
      riskScore: row.risk_score,
      expiresAt: row.expires_at,
    } as any);
  }

  await auditLogger.log('ACTION_EVALUATED', actionId, { status: initialStatus, tool: action.toolName });

  return { actionId, decision: policyResult.decision, reason: policyResult.reason, riskScore: risk.score, paramsHash };
}

export async function decideApproval(
  actionId: string,
  humanDecision: 'APPROVE' | 'REJECT',
  opts: { decidedBy?: string; allowedAgentIds?: string[] } = {}
) {
  const decidedBy = opts.decidedBy ?? 'Admin';
  const newStatus = humanDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

  const action = await loadAction(actionId);
  if (!action) throw new HttpError('Action not found.', 404);

  // Demo approvals are limited to demo agents.
  if (opts.allowedAgentIds && !opts.allowedAgentIds.includes(action.agentId)) {
    throw new HttpError('This action cannot be decided from the demo.', 403);
  }

  if (action.status !== 'PENDING') {
    throw new HttpError(`Action is already ${action.status}.`, 409);
  }

  if (Date.now() > new Date(action.expiresAt).getTime()) {
    await claim(actionId, ['PENDING'], 'EXPIRED');
    throw new HttpError('Action has expired. Request a new one.', 410);
  }

  // Atomic: only one request can move PENDING to APPROVED/REJECTED.
  const won = await claim(actionId, ['PENDING'], newStatus, { notExpired: true });
  if (!won) throw new HttpError('Action was already decided or has expired.', 409);

  await auditLogger.log('HUMAN_DECISION', actionId, { decidedBy, decision: humanDecision, newStatus });
  return { success: true, newStatus };
}

export async function getRecentActions() {
  const now = Date.now();
  // A pending action past its deadline is shown as EXPIRED.
  const shown = (status: string, expiresAt?: string) =>
    status === 'PENDING' && expiresAt && now > new Date(expiresAt).getTime() ? 'EXPIRED' : status;

  if (isDbEnabled) {
    const { data, error } = await supabase!.from('actions').select('*').order('sequence', { ascending: false }).limit(20);
    if (error) throw new HttpError('Storage error.', 503);
    return (data || []).map((a: any) => ({
      actionId: a.id,
      agentId: a.agent_id,
      toolName: a.tool_name,
      parameters: a.parameters,
      status: shown(a.status, a.expires_at),
      riskScore: a.risk_score,
      reason: a.reason,
      paramsHash: a.params_hash,
      timestamp: a.timestamp,
      expiresAt: a.expires_at,
    }));
  }

  return Array.from(actionMemory.entries())
    .map(([id, a]: [string, any]) => ({ actionId: id, ...a, status: shown(a.status, a.expiresAt) }))
    .sort((x: any, y: any) => y.sequence - x.sequence)
    .slice(0, 20);
}

export async function executeAction(agentId: string, actionId: string) {
  const action = await loadAction(actionId);
  if (!action) throw new HttpError('Action not found.', 404);
  if (action.agentId !== agentId) throw new HttpError('Unauthorized agent.', 403);

  if (action.status !== 'ALLOWED' && action.status !== 'APPROVED') {
    throw new HttpError(`Cannot execute. Status is: ${action.status}`, 409);
  }

  if (Date.now() > new Date(action.expiresAt).getTime()) {
    await claim(actionId, ['ALLOWED', 'APPROVED'], 'EXPIRED');
    throw new HttpError('Action has expired. Request a new one.', 410);
  }

  const currentHash = generateHash(action.parameters);
  if (currentHash !== action.paramsHash) {
    await auditLogger.log('TOCTOU_ATTACK_BLOCKED', actionId, { expected: action.paramsHash, actual: currentHash });
    throw new HttpError('Security Error: Parameters were altered (TOCTOU).', 409);
  }

  const handler = ToolHandlers[action.toolName as keyof typeof ToolHandlers] as any;
  if (!handler) throw new HttpError('Tool handler not found.', 500);

  // Atomic single-use claim BEFORE running the tool. If two requests arrive
  // together, only one gets past this line, so the tool never runs twice.
  const won = await claim(actionId, ['ALLOWED', 'APPROVED'], 'EXECUTING', { agentId });
  if (!won) throw new HttpError('Action was already used or changed.', 409);

  let result: any;
  try {
    result = await handler(action.parameters);
  } catch (err) {
    await claim(actionId, ['EXECUTING'], 'FAILED');
    await auditLogger.log('ACTION_FAILED', actionId, { error: 'Tool handler error' });
    throw new HttpError('Tool execution failed.', 502);
  }

  await claim(actionId, ['EXECUTING'], 'EXECUTED');

  const safeResult = JSON.parse(JSON.stringify(result ?? {}));
  if (safeResult.message) safeResult.message = maskSensitiveData(safeResult.message);

  await auditLogger.log('ACTION_EXECUTED', actionId, { result: safeResult });
  return result;
}
EOF_GATEWAY

# ---------------------------------------------------------------
# 2. Admin decision route (needs ADMIN_TOKEN, fails closed)
# ---------------------------------------------------------------
cat > "apps/web/app/api/approvals/[id]/decision/route.ts" << 'EOF_DECISION'
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { decideApproval } from '@wall-a/core';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // no token configured = nobody gets in
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);

    if (!body || !['APPROVE', 'REJECT'].includes(body.decision)) {
      return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
    }

    const result = await decideApproval(id, body.decision);
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    const message = status === 500 ? 'Internal error' : error.message;
    return NextResponse.json({ error: message }, { status });
  }
}
EOF_DECISION

# ---------------------------------------------------------------
# 3. Reset route (admin only)
# ---------------------------------------------------------------
cat > apps/web/app/api/actions/reset/route.ts << 'EOF_RESET'
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { supabase, isDbEnabled } from '@wall-a/core';

function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${expected}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function DELETE(req: Request) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isDbEnabled) {
    // In-memory mode: restart the dev server to reset.
    return NextResponse.json({ success: true, mode: 'memory' });
  }

  const a = await supabase!.from('actions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const l = await supabase!.from('audit_logs').delete().neq('id', -1);
  const g = await supabase!.from('agents').delete().neq('id', 'none');

  if (a.error || l.error || g.error) {
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, mode: 'database' });
}
EOF_RESET

# ---------------------------------------------------------------
# 4. Demo-only approve route (no admin token, limited to demo agents)
# ---------------------------------------------------------------
cat > apps/web/app/api/demo/approve/route.ts << 'EOF_DEMO'
import { NextResponse } from 'next/server';
import { decideApproval } from '@wall-a/core';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const actionId = body?.actionId;
  const decision = body?.decision ?? 'APPROVE';

  if (typeof actionId !== 'string' || !UUID_RE.test(actionId)) {
    return NextResponse.json({ error: 'Invalid action id' }, { status: 400 });
  }
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 });
  }

  // Only these agents can be decided from the public demo.
  const demoAgents = (process.env.DEMO_AGENT_IDS ?? 'agent-001')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const result = await decideApproval(actionId, decision, {
      decidedBy: 'Demo visitor',
      allowedAgentIds: demoAgents,
    });
    return NextResponse.json(result);
  } catch (error: any) {
    const status = error?.statusCode ?? 500;
    const message = status === 500 ? 'Internal error' : error.message;
    return NextResponse.json({ error: message }, { status });
  }
}
EOF_DEMO

echo ""
echo "Files written. Quick checks:"
echo "1) Anything still using the old token? (should print nothing)"
grep -rn "ADMIN_SECRET_TOKEN" apps packages README.md --include=*.ts --include=*.tsx --include=*.js --include=*.md --exclude-dir=node_modules --exclude-dir=.next || true
echo "2) auditLogger.log calls missing await? (should print nothing)"
grep -rn "auditLogger.log" apps packages --include=*.ts --include=*.tsx --exclude-dir=node_modules --exclude-dir=.next | grep -v "await" || true
echo "3) Does core export supabase and isDbEnabled?"
grep -n "supabase\|isDbEnabled\|db" packages/core/src/index.ts || true
echo "Done."

