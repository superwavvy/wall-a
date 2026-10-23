import { AgentContext, ActionRequest } from '../types/index';
import { evaluatePolicy } from './policy';
import { calculateRisk } from './risk';
import { generateHash } from './crypto';
import { ToolHandlers } from '../tools/handlers';
import { auditLogger } from './audit';

const globalForStore = globalThis as unknown as { 
  actionStore: Map<string, any>, 
  agentStore: Map<string, any>,
  seqCounter: number 
};

export const actionStore = globalForStore.actionStore || new Map();
export const agentStore = globalForStore.agentStore || new Map();
export let sequenceCounter = globalForStore.seqCounter || 0;

if (process.env.NODE_ENV !== 'production') {
  globalForStore.actionStore = actionStore;
  globalForStore.agentStore = agentStore;
  globalForStore.seqCounter = sequenceCounter;
}

export async function evaluateAction(agentInput: AgentContext, action: ActionRequest) {
  const agentState = agentStore.get(agentInput.agentId) || { tainted: false };
  const agent = { ...agentInput, tainted: agentState.tainted };

  const paramsHash = generateHash(action.parameters);
  
  for (const [id, existing] of actionStore.entries()) {
    if (existing.agentId === agent.agentId && existing.toolName === action.toolName && existing.paramsHash === paramsHash && existing.status === 'PENDING') {
      return { actionId: id, decision: existing.status, reason: "Duplicate request pending.", riskScore: existing.riskScore, paramsHash };
    }
  }

  const policyResult = evaluatePolicy(agent, action);
  const risk = calculateRisk(agent, action);
  const actionId = crypto.randomUUID();
  
  // Increment sequence
  sequenceCounter++;
  globalForStore.seqCounter = sequenceCounter;

  // FIX: ALLOWED vs APPROVED
  let initialStatus = 'PENDING';
  if (policyResult.decision === 'ALLOW') initialStatus = 'ALLOWED';
  if (policyResult.decision === 'BLOCK') initialStatus = 'BLOCKED';

  const isTaintTrigger = action.toolName === 'fetch_url';
  if (isTaintTrigger) {
    agentStore.set(agent.agentId, { tainted: true });
    auditLogger.log('AGENT_TAINTED', agent.agentId, { reason: 'Fetched untrusted URL' });
  }

  const actionData = {
    agentId: agent.agentId,
    toolName: action.toolName,
    parameters: action.parameters,
    paramsHash,
    status: initialStatus,
    riskScore: risk.score,
    reason: isTaintTrigger ? "Allowed — session now TAINTED" : policyResult.reason,
    sequence: sequenceCounter,
    timestamp: new Date().toISOString()
  };

  actionStore.set(actionId, actionData);
  auditLogger.log('ACTION_EVALUATED', actionId, { status: initialStatus, tool: action.toolName });

  return { actionId, decision: policyResult.decision, reason: policyResult.reason, riskScore: risk.score, paramsHash };
}

export async function decideApproval(actionId: string, humanDecision: 'APPROVE' | 'REJECT') {
  const action = actionStore.get(actionId);
  if (!action) throw new Error("Action not found");
  if (action.status !== 'PENDING') {
    const err = new Error(`Action is already ${action.status}.`);
    (err as any).statusCode = 409;
    throw err;
  }
  
  action.status = humanDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  actionStore.set(actionId, action);
  auditLogger.log('HUMAN_DECISION', actionId, { decidedBy: "Admin", decision: humanDecision, newStatus: action.status });
  return { success: true, newStatus: action.status };
}

export function getRecentActions() {
  return Array.from(actionStore.entries())
    .map(([id, action]) => ({ actionId: id, ...action }))
    // FIX: Sort by sequence, not timestamp
    .sort((a, b) => b.sequence - a.sequence)
    .slice(0, 20);
}

export async function executeAction(agentId: string, actionId: string) {
  const storedAction = actionStore.get(actionId);
  if (!storedAction) throw new Error("Action not found.");
  if (storedAction.agentId !== agentId) throw new Error("Unauthorized agent.");
  
  // FIX: Accept ALLOWED or APPROVED
  if (storedAction.status !== 'ALLOWED' && storedAction.status !== 'APPROVED') {
    const err = new Error(`Cannot execute. Status is: ${storedAction.status}`);
    (err as any).statusCode = 409;
    throw err;
  }

  const currentHash = generateHash(storedAction.parameters);
  if (currentHash !== storedAction.paramsHash) {
    auditLogger.log('TOCTOU_ATTACK_BLOCKED', actionId, { expected: storedAction.paramsHash, actual: currentHash });
    throw new Error("Security Error: Parameters were altered (TOCTOU).");
  }

  const handler = ToolHandlers[storedAction.toolName as keyof typeof ToolHandlers];
  if (!handler) throw new Error("Tool handler not found.");

  const result = await handler(storedAction.parameters);
  storedAction.status = 'EXECUTED';
  actionStore.set(actionId, storedAction);
  auditLogger.log('ACTION_EXECUTED', actionId, { result });
  return result;
}
