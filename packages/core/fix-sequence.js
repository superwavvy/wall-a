var fs = require('fs');
var s = fs.readFileSync('src/engine/gateway.ts', 'utf8');

// Find the object being inserted
var oldInsert = `  const row = {
    id: actionId,
    agent_id: agent.agentId,
    tool_name: action.toolName,
    parameters: action.parameters,
    params_hash: paramsHash,
    status: initialStatus,
    risk_score: risk.score,
    reason: taintsSession ? 'Allowed — session now TAINTED' : policyResult.reason,
    expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
  };`;

var newInsert = `  const row: any = {
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
  
  if (!isDbEnabled) {
    row.sequence = incrementSeq();
  }`;

if (!s.includes(oldInsert)) {
  console.error("FAIL: Could not find the insert block.");
  process.exit(1);
}

s = s.replace(oldInsert, newInsert);
fs.writeFileSync('src/engine/gateway.ts', s);
console.log("OK: Sequence fix applied.");
