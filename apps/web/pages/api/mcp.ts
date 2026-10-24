import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { evaluateAction, executeAction } from "@wall-a/core";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";

// Enable bodyParser for Streamable HTTP
export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Streamable HTTP uses POST for all requests (initialize, tool calls, etc.)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const server = new McpServer({ name: "wall-a-gateway", version: "1.0.0" });

  server.tool("send_email", { to: z.string(), subject: z.string(), body: z.string() }, async (args) => {
    const agent = { agentId: "mcp-agent", permissions: ["send_email"], tainted: false };
    const action = { toolName: "send_email", parameters: args };
    const evalRes = await evaluateAction(agent, action);
    
    if (evalRes.decision === "BLOCK") return { content: [{ type: "text", text: `🛡️ WALL-A BLOCKED: ${evalRes.reason}` }], isError: true };
    if (evalRes.decision === "REQUIRE_APPROVAL") return { content: [{ type: "text", text: `⚠️ WALL-A REQUIRE_APPROVAL: Action pending review. ID: ${evalRes.actionId}` }], isError: true };

    await executeAction(agent.agentId, evalRes.actionId);
    return { content: [{ type: "text", text: `✅ Email sent to ${args.to}` }] };
  });

  server.tool("db_query", { query: z.string() }, async (args) => {
    const agent = { agentId: "mcp-agent", permissions: ["db_query"], tainted: false };
    const action = { toolName: "db_query", parameters: args };
    const evalRes = await evaluateAction(agent, action);
    
    if (evalRes.decision === "BLOCK") return { content: [{ type: "text", text: `🛡️ WALL-A BLOCKED: ${evalRes.reason}` }], isError: true };
    
    await executeAction(agent.agentId, evalRes.actionId);
    return { content: [{ type: "text", text: `✅ Query executed.` }] };
  });

  server.tool("fetch_url", { url: z.string() }, async (args) => {
    const agent = { agentId: "mcp-agent", permissions: ["fetch_url"], tainted: false };
    const action = { toolName: "fetch_url", parameters: args };
    const evalRes = await evaluateAction(agent, action);
    
    if (evalRes.decision === "BLOCK") return { content: [{ type: "text", text: `🛡️ WALL-A BLOCKED: ${evalRes.reason}` }], isError: true };
    
    await executeAction(agent.agentId, evalRes.actionId);
    return { content: [{ type: "text", text: `🌐 Fetched ${args.url}. WARNING: Context is now TAINTED.` }] };
  });

  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true,      // Return JSON immediately instead of streaming
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
