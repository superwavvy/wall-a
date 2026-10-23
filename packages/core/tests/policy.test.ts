import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../src/engine/policy';
import { AgentContext } from '../src/types/index';

describe('WALL-A Policy Engine', () => {
  const baseAgent: AgentContext = { 
    agentId: 'agent-001', 
    permissions: ['send_email', 'db_query'], 
    tainted: false 
  };

  it('blocks destructive SQL', () => {
    const action = { toolName: 'db_query', parameters: { query: 'DROP TABLE users;' } };
    const result = evaluatePolicy(baseAgent, action);
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('DESTRUCTIVE_SQL');
  });

  it('escalates high-impact action if agent is tainted', () => {
    const taintedAgent = { ...baseAgent, tainted: true };
    const action = { toolName: 'send_email', parameters: { to: 'a@b.com', subject: 'hi', body: 'hello' } };
    const result = evaluatePolicy(taintedAgent, action);
    expect(result.decision).toBe('REQUIRE_APPROVAL');
    // We changed the rule name when we added the Risk Engine
    expect(result.matchedRule).toBe('RISK_ESCALATION'); 
  });

  it('blocks actions the agent does not have permission for', () => {
    const action = { toolName: 'delete_resource', parameters: {} };
    const result = evaluatePolicy(baseAgent, action);
    expect(result.decision).toBe('BLOCK');
    expect(result.matchedRule).toBe('AGENT_PERMISSION');
  });

  it('allows safe actions for untainted agents', () => {
    const action = { toolName: 'send_email', parameters: { to: 'a@b.com', subject: 'hi', body: 'hello' } };
    const result = evaluatePolicy(baseAgent, action);
    expect(result.decision).toBe('ALLOW');
  });
});
