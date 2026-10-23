import { AgentContext, ActionRequest } from '../types/index';

export function calculateRisk(agent: AgentContext, action: ActionRequest) {
  let score = 0;
  const reasons: string[] = [];

  // 1. Taint Check
  if (agent.tainted) {
    score += 50;
    reasons.push("Session is tainted by untrusted input");
  }

  // 2. SQL Injection Check
  if (action.toolName === 'db_query') {
    const query = (action.parameters.query || '').toUpperCase();
    if (query.includes('DROP') || query.includes('TRUNCATE') || (query.includes('DELETE') && !query.includes('WHERE'))) {
      score += 100;
      reasons.push("Destructive SQL query detected");
    }
  }

  // 3. Path Traversal Check
  if (action.toolName === 'read_file') {
    const path = action.parameters.path || '';
    if (path.includes('..') || path.startsWith('/etc/') || path.startsWith('/var/')) {
      score += 100;
      reasons.push("Path traversal attempt detected");
    }
  }

  // 4. Email Specific Checks
  if (action.toolName === 'send_email') {
    const to = action.parameters.to || '';
    
    if (to.includes('evil.com') || to.includes('hacker')) {
      score += 100;
      reasons.push("Destination domain is on the hard blocklist");
    } else if (to.includes('@gmail.com') || to.includes('@yahoo.com')) {
      score += 30;
      reasons.push("External free email provider (first-time recipient)");
    }
  }

  return { score: Math.min(score, 100), reasons };
}
