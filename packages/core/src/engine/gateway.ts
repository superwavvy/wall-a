import { randomUUID } from 'node:crypto';
import { AgentContext, ActionRequest } from '../types/index';
import { evaluatePolicy } from './policy';
import { findSecret, redactSecrets } from './secrets';
import { calculateRisk } from './risk';
import { generateHash, maskSensitiveData } from './crypto';
import { ToolHandlers } from '../tools/handlers';
import { auditLogger } from './audit';
import { supabase, isDbEnabled, actionMemory, agentMemory, auditMemory, incrementSeq } from './db';

const APPROVAL_TTL_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

class HttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

type StoredAction = {
  id: string;
  clientId: string;
  agentId: string;
  toolName: string;
  parameters: any;
  paramsHash: string;
  status: string;
  riskScore: number;
  reason: string;
  expiresAt: string;
};

function cleanClientId(raw?: string): string {
  if (raw === undefined || raw === null) return 'default';
  if (typeof raw !== 'string' || !ID_RE.test(raw)) throw new HttpError('Invalid workspace id.', 400);
  return raw;
}

function cleanSessionId(raw: unknown): string | undefined {
  return typeof raw === 'string' && ID_RE.test(raw) ? raw : undefined;
}

function taintKey(clientId: string, agentId: string, sessionId?: string): string {
  return sessionId ? `${clientId}::${agentId}::${sessionId}` : `${clientId}::${agentId}`;
}

async function loadAction(actionId: string): Promise<StoredAction | null> {
  if (!UUID_RE.test(actionId)) return null;

  if (isDbEnabled) {
    const { data, error } = await supabase!.from('actions').select('*').eq('id', actionId).maybeSingle();
    if (error) throw new HttpError('Storage error.', 503);
    if (!data) return null;
    return {
      id: data.id, clientId: data.client_id ?? 'default', agentId: data.agent_id,
      toolName: data.tool_name, parameters: data.parameters, paramsHash: data.params_hash,
      status: data.status, riskScore: data.risk_score, reason: data.reason, expiresAt: data.expires_at,
    };
  }

  const a: any = actionMemory.get(actionId);
  if (!a) return null;
  return {
    id: actionId, clientId: a.clientId ?? 'default', agentId: a.agentId,
    toolName: a.toolName, parameters: a.parameters, paramsHash: a.paramsHash,
    status: a.status, riskScore: a.riskScore, reason: a.reason, expiresAt: a.expiresAt,
  };
}

async function claim(actionId: string, from: string[], to: string, opts: { agentId?: string; notExpired?: boolean } = {}): Promise<boolean> {
  if (isDbEnabled) {
    let q: any = supabase!.from('actions').update({ status: to }).eq('id', actionId).in('status', from);
    if (opts.agentId) q = q.eq('agent_id', opts.agentId);
    if (opts.notExpired) q = q.gt('expires_at', new Date().toISOString());
    const { data, error } = await q.select('id');
    if (error) throw new HttpError('Storage error.', 503);
    return Array.isArray(data) && data.length === 1;
  }

  const a: any = actionMemory.get(actionId);
  if (!a || !from.includes(a.status)) return false;
  if (opts.agentId && a.agentId !== opts.agentId) return false;
  if (opts.notExpired && Date.now() > new Date(a.expiresAt).getTime()) return false;
  a.status = to;
  actionMemory.set(actionId, a);
  return true;
}

async function isWorkspacePaused(tenant: string): Promise<boolean> {
  if (!isDbEnabled) return false;
  const { data, error } = await supabase!.from('workspaces').select('paused').eq('client_id', tenant).maybeSingle();
  if (error) return true; // fail closed: if we cannot read the switch, block
  return !!data?.paused;
}

export async function evaluateAction(agentInput: AgentContext, action: ActionRequest, clientId?: string) {
  const tenant = cleanClientId(clientId);
  const sessionId = cleanSessionId((agentInput as any).sessionId);
  const key = taintKey(tenant, agentInput.agentId, sessionId);

  let tainted = false;
  if (isDbEnabled) {
    const { data, error } = await supabase!.from('agents').select('tainted').eq('id', key).maybeSingle();
    if (error) tainted = true;
    else if (data) tainted = !!data.tainted;
  } else {
    tainted = !!(agentMemory.get(key) as any)?.tainted;
  }

  const agent = { ...agentInput, tainted };
  const paramsHash = generateHash(action.parameters);

  if (isDbEnabled) {
    const { data: dup } = await supabase!.from('actions').select('id, risk_score').eq('client_id', tenant).eq('agent_id', agent.agentId).eq('tool_name', action.toolName).eq('params_hash', paramsHash).eq('status', 'PENDING').gt('expires_at', new Date().toISOString()).limit(1);
    if (dup && dup.length > 0) return { actionId: dup[0].id, decision: 'PENDING', reason: 'Duplicate request pending.', riskScore: dup[0].risk_score, paramsHash };
  } else {
    for (const [id, existing] of actionMemory.entries()) {
      const e: any = existing;
      if (e.clientId === tenant && e.agentId === agent.agentId && e.toolName === action.toolName && e.paramsHash === paramsHash && e.status === 'PENDING' && Date.now() <= new Date(e.expiresAt).getTime()) {
        return { actionId: id, decision: e.status, reason: 'Duplicate request pending.', riskScore: e.riskScore, paramsHash };
      }
    }
  }

  const paused = await isWorkspacePaused(tenant);
  const policyResult: any = paused
    ? { decision: 'BLOCK', reason: 'Workspace is paused by its owner.' }
    : evaluatePolicy(agent, action);
  const risk = calculateRisk(agent, action);
  // The score we store: a rule-based block is always 100, an approval request at least 30.
  // (A paused workspace has no rule, so it keeps its calculated score.)
  const storedScore = policyResult.decision === 'BLOCK' && policyResult.matchedRule
    ? 100
    : policyResult.decision === 'REQUIRE_APPROVAL'
    ? Math.max(risk.score, 30)
    : risk.score;
  const actionId = randomUUID();

  let initialStatus = 'PENDING';
  if (policyResult.decision === 'ALLOW') initialStatus = 'ALLOWED';
  if (policyResult.decision === 'BLOCK') initialStatus = 'BLOCKED';

  const taintsSession = action.toolName === 'fetch_url' && policyResult.decision === 'ALLOW';
  if (taintsSession) {
    if (isDbEnabled) {
      const { error } = await supabase!.from('agents').upsert({ id: key, tainted: true });
      if (error) throw new HttpError('Could not record session state.', 503);
    } else {
      agentMemory.set(key, { tainted: true } as any);
    }
    await auditLogger.log('AGENT_TAINTED', actionId, { reason: 'Fetched untrusted URL' }, tenant);
  }

  const row = {
    id: actionId, client_id: tenant, agent_id: agent.agentId, tool_name: action.toolName,
    parameters: (findSecret(action.parameters) ? redactSecrets(action.parameters) : action.parameters) as any, params_hash: paramsHash, status: initialStatus,
    risk_score: storedScore, decision: policyResult.decision, reason: taintsSession ? 'Allowed — session now TAINTED' : policyResult.reason,
    expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  };

  if (isDbEnabled) {
    const { error } = await supabase!.from('actions').insert(row);
    if (error) throw new HttpError('Could not record action.', 503);
  } else {
    actionMemory.set(actionId, {
      ...row, sequence: incrementSeq(), actionId: row.id, clientId: row.client_id, agentId: row.agent_id,
      toolName: row.tool_name, paramsHash: row.params_hash, riskScore: row.risk_score, expiresAt: row.expires_at,
    } as any);
  }

  await auditLogger.log('ACTION_EVALUATED', actionId, { status: initialStatus, tool: action.toolName }, tenant);
  return { actionId, decision: policyResult.decision, reason: policyResult.reason, riskScore: storedScore, paramsHash };
}

export async function decideApproval(actionId: string, humanDecision: 'APPROVE' | 'REJECT', opts: { decidedBy?: string; allowedAgentIds?: string[]; clientId?: string } = {}) {
  const decidedBy = opts.decidedBy ?? 'Admin';
  const newStatus = humanDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const action = await loadAction(actionId);
  if (!action) throw new HttpError('Action not found.', 404);

  if (opts.clientId !== undefined && action.clientId !== cleanClientId(opts.clientId)) throw new HttpError('Action not found.', 404);
  if (opts.allowedAgentIds && !opts.allowedAgentIds.includes(action.agentId)) throw new HttpError('This action cannot be decided from the demo.', 403);
  if (action.status !== 'PENDING') throw new HttpError(`Action is already ${action.status}.`, 409);
  if (Date.now() > new Date(action.expiresAt).getTime()) {
    await claim(actionId, ['PENDING'], 'EXPIRED');
    throw new HttpError('Action has expired. Request a new one.', 410);
  }

  const won = await claim(actionId, ['PENDING'], newStatus, { notExpired: true });
  if (!won) throw new HttpError('Action was already decided or has expired.', 409);

  await auditLogger.log('HUMAN_DECISION', actionId, { decidedBy, decision: humanDecision, newStatus }, action.clientId);
  return { success: true, newStatus };
}

export async function getRecentActions(clientId?: string) {
  const tenant = cleanClientId(clientId);
  const now = Date.now();
  const shown = (status: string, expiresAt?: string) => status === 'PENDING' && expiresAt && now > new Date(expiresAt).getTime() ? 'EXPIRED' : status;

  if (isDbEnabled) {
    const { data, error } = await supabase!.from('actions').select('*').eq('client_id', tenant).order('sequence', { ascending: false }).limit(20);
    if (error) throw new HttpError('Storage error.', 503);
    return (data || []).map((a: any) => ({
      actionId: a.id, agentId: a.agent_id, toolName: a.tool_name, parameters: a.parameters,
      status: shown(a.status, a.expires_at), decision: a.decision ?? null, riskScore: a.risk_score, reason: a.reason, paramsHash: a.params_hash, timestamp: a.timestamp, expiresAt: a.expires_at,
    }));
  }

  return Array.from(actionMemory.entries()).filter(([, a]: [string, any]) => a.clientId === tenant).map(([id, a]: [string, any]) => ({ actionId: id, ...a, status: shown(a.status, a.expiresAt) })).sort((x: any, y: any) => y.sequence - x.sequence).slice(0, 20);
}

export async function executeAction(agentId: string, actionId: string, opts: { clientId?: string } = {}) {
  const action = await loadAction(actionId);
  if (!action) throw new HttpError('Action not found.', 404);
  if (opts.clientId !== undefined && action.clientId !== cleanClientId(opts.clientId)) throw new HttpError('Action not found.', 404);
  if (await isWorkspacePaused(action.clientId)) throw new HttpError('Workspace is paused.', 423);
  if (action.agentId !== agentId) throw new HttpError('Unauthorized agent.', 403);
  if (action.status !== 'ALLOWED' && action.status !== 'APPROVED') throw new HttpError(`Cannot execute. Status is: ${action.status}`, 409);
  if (Date.now() > new Date(action.expiresAt).getTime()) {
    await claim(actionId, ['ALLOWED', 'APPROVED'], 'EXPIRED');
    throw new HttpError('Action has expired. Request a new one.', 410);
  }

  const currentHash = generateHash(action.parameters);
  if (currentHash !== action.paramsHash) {
    await auditLogger.log('TOCTOU_ATTACK_BLOCKED', actionId, { expected: action.paramsHash, actual: currentHash }, action.clientId);
    throw new HttpError('Security Error: Parameters were altered (TOCTOU).', 409);
  }

  const handler = ToolHandlers[action.toolName as keyof typeof ToolHandlers] as any;
  if (!handler) throw new HttpError('Tool handler not found.', 500);

  const won = await claim(actionId, ['ALLOWED', 'APPROVED'], 'EXECUTING', { agentId });
  if (!won) throw new HttpError('Action was already used or changed.', 409);

  let result: any;
  try {
    result = await handler(action.parameters);
  } catch (err) {
    await claim(actionId, ['EXECUTING'], 'FAILED');
    await auditLogger.log('ACTION_FAILED', actionId, { error: 'Tool handler error' }, action.clientId);
    throw new HttpError('Tool execution failed.', 502);
  }

  await claim(actionId, ['EXECUTING'], 'EXECUTED');
  const safeResult = JSON.parse(JSON.stringify(result ?? {}));
  if (safeResult.message) safeResult.message = maskSensitiveData(safeResult.message);
  await auditLogger.log('ACTION_EXECUTED', actionId, { result: safeResult }, action.clientId);
  return result;
}

export async function resetWorkspace(clientId: string) {
  const tenant = cleanClientId(clientId);
  if (isDbEnabled) {
    const escaped = tenant.replace(/[\\%_]/g, '\\$&');
    const a = await supabase!.from('actions').delete().eq('client_id', tenant);
    const l = await supabase!.from('audit_logs').delete().eq('client_id', tenant);
    const g = await supabase!.from('agents').delete().like('id', `${escaped}::%`);
    if (a.error || l.error || g.error) throw new HttpError('Reset failed.', 503);
    return { success: true };
  }

  for (const [id, a] of Array.from(actionMemory.entries())) { if ((a as any).clientId === tenant) actionMemory.delete(id); }
  for (let i = auditMemory.length - 1; i >= 0; i--) { if ((auditMemory[i] as any)?.clientId === tenant) auditMemory.splice(i, 1); }
  for (const k of Array.from(agentMemory.keys())) { if (String(k).startsWith(`${tenant}::`)) agentMemory.delete(k); }
  return { success: true };
}
