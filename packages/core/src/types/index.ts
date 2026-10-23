export type Decision = 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';

export interface AgentContext {
  agentId: string;
  permissions: string[];
  tainted: boolean;
}

export interface ActionRequest {
  toolName: string;
  parameters: Record<string, any>;
}

export interface PolicyResult {
  decision: Decision;
  matchedRule: string;
  reason: string;
}
