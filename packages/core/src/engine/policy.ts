import { AgentContext, ActionRequest, PolicyResult } from '../types/index';
import { calculateRisk } from './risk';

export function evaluatePolicy(agent: AgentContext, action: ActionRequest): PolicyResult {
  // 1. Hard Blocks
  if (!agent.permissions.includes(action.toolName)) {
    return { decision: 'BLOCK', matchedRule: 'AGENT_PERMISSION', reason: `No permission for ${action.toolName}` };
  }

  if (action.toolName === 'db_query') {
    const query = (action.parameters.query || '').toUpperCase();
    if (query.includes('DROP') || query.includes('TRUNCATE') || (query.includes('DELETE') && !query.includes('WHERE'))) {
      return { decision: 'BLOCK', matchedRule: 'DESTRUCTIVE_SQL', reason: 'Destructive SQL queries are forbidden.' };
    }
  }

  // NEW: Path Traversal Block
  if (action.toolName === 'read_file') {
    const path = action.parameters.path || '';
    if (path.includes('..') || path.startsWith('/etc/') || path.startsWith('/var/')) {
      return { decision: 'BLOCK', matchedRule: 'PATH_TRAVERSAL', reason: 'Path traversal or system file access is forbidden.' };
    }
  }

  // 2. Risk Escalation
  const risk = calculateRisk(agent, action);
  
  if (risk.score >= 90) {
    return { decision: 'BLOCK', matchedRule: 'HIGH_RISK', reason: risk.reasons.join("; ") };
  }
  
  if (risk.score >= 30) {
    return { decision: 'REQUIRE_APPROVAL', matchedRule: 'RISK_ESCALATION', reason: risk.reasons.join("; ") };
  }

  return { decision: 'ALLOW', matchedRule: 'DEFAULT_ALLOW', reason: 'Action permitted by policy.' };
}
