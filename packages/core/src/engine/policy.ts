import { AgentContext, ActionRequest, PolicyResult } from '../types/index';
import { calculateRisk } from './risk';
import { findSecret } from './secrets';
import { checkSql, checkPath, checkEmail, checkUrl } from './rules';

export function evaluatePolicy(agent: AgentContext, action: ActionRequest): PolicyResult {
  if (!agent.permissions.includes(action.toolName)) {
    return { decision: 'BLOCK', matchedRule: 'AGENT_PERMISSION', reason: `No permission for ${action.toolName}` };
  }

  // Block secrets in parameters (the reason names the kind, never the value)
  const secretKind = findSecret(action.parameters);
  if (secretKind) {
    return { decision: 'BLOCK', matchedRule: 'SECRET_IN_PARAMETERS', reason: `Parameters contain what looks like a secret (${secretKind}).` } as any;
  }

  // Block destructive SQL
  if (action.toolName === 'db_query') {
    const query = (action.parameters.query || '').toUpperCase();
    if (query.includes('DROP') || query.includes('TRUNCATE') || (query.includes('DELETE') && !query.includes('WHERE'))) {
      return { decision: 'BLOCK', matchedRule: 'DESTRUCTIVE_SQL', reason: 'Destructive SQL queries are forbidden.' };
    }
  }

  // Block path traversal in read/write
  if (action.toolName === 'read_file' || action.toolName === 'write_file') {
    const path = action.parameters.path || '';
    if (path.includes('..') || path.startsWith('/etc/') || path.startsWith('/var/')) {
      return { decision: 'BLOCK', matchedRule: 'PATH_TRAVERSAL', reason: 'Path traversal or system file access is forbidden.' };
    }
  }

  // Hardened rules (see rules.ts). The older rules above still run first.
  if (action.toolName === 'db_query') {
    const r = checkSql(action.parameters.query);
    if (r) return r as any;
  }
  if (action.toolName === 'read_file' || action.toolName === 'write_file') {
    const r = checkPath(action.parameters.path);
    if (r) return r as any;
  }
  if (action.toolName === 'fetch_url') {
    const r = checkUrl(action.parameters.url);
    if (r) return r as any;
  }

  // Always require approval for deleting resources
  if (action.toolName === 'delete_resource') {
    return { decision: 'REQUIRE_APPROVAL', matchedRule: 'DESTRUCTIVE_ACTION', reason: 'Deleting resources requires human approval.' };
  }

  const risk = calculateRisk(agent, action);
  
  if (risk.score >= 90) return { decision: 'BLOCK', matchedRule: 'HIGH_RISK', reason: risk.reasons.join("; ") };
  if (action.toolName === 'send_email') {
    const e = checkEmail(action.parameters);
    if (e && (e.decision === 'BLOCK' || risk.score < 30)) return e as any;
  }
  if (risk.score >= 30) return { decision: 'REQUIRE_APPROVAL', matchedRule: 'RISK_ESCALATION', reason: risk.reasons.join("; ") };

  return { decision: 'ALLOW', matchedRule: 'DEFAULT_ALLOW', reason: 'Action permitted by policy.' };
}
