import { describe, it, expect } from 'vitest';
import { evaluateAction, executeAction, __getStoreForTesting } from '../src/engine/gateway';
import { AgentContext } from '../src/types/index';
import { canonicalize } from '../src/engine/crypto';

describe('WALL-A Gateway (TOCTOU Protection)', () => {
  const agent: AgentContext = { agentId: 'agent-1', permissions: ['send_email'], tainted: false };

  it('canonicalizes objects correctly regardless of key order', () => {
    const obj1 = { b: 2, a: 1 };
    const obj2 = { a: 1, b: 2 };
    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
  });

  it('executes an action successfully if parameters are untouched', async () => {
    const action = { toolName: 'send_email', parameters: { to: 'test@test.com', subject: 'Hi', body: 'Hello' } };
    
    const evalResult = await evaluateAction(agent, action);
    expect(evalResult.decision).toBe('ALLOW');

    const execResult = await executeAction(agent.agentId, evalResult.actionId);
    expect(execResult.success).toBe(true);
  });

  it('blocks execution if parameters are altered after evaluation (TOCTOU)', async () => {
    const action = { toolName: 'send_email', parameters: { to: 'safe@test.com', subject: 'Hi', body: 'Hello' } };
    
    const evalResult = await evaluateAction(agent, action);
    expect(evalResult.decision).toBe('ALLOW');

    const store = __getStoreForTesting();
    const storedAction = store.get(evalResult.actionId);
    
    // Attacker changes the parameter in the database
    storedAction.parameters.body = "HACKED BODY";

    // We updated the expected error string to match our new code
    await expect(executeAction(agent.agentId, evalResult.actionId)).rejects.toThrow(
      "Security Error: Parameters were altered (TOCTOU)."
    );
  });
});
