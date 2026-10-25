import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { evaluateAction, executeAction } from "@wall-a/core";
import { z } from "zod";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = { api: { bodyParser: true } };

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function headerValue(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && ID_RE.test(s) ? s : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const clientId = headerValue(req.headers["x-client-id"]);
  if (!clientId) return res.status(400).json({ error: "Missing or invalid x-client-id" });
  // Optional. Send the same value on every call so taint carries between calls.
  const sessionId = headerValue(req.headers["x-session-id"]) ?? undefined;

  const server = new McpServer({ name: "wall-a-gateway", version: "1.0.0" });

  const reply = (text: string, isError = false) => ({
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  });

  const registerTool = (name: string, schema: z.ZodRawShape, handler: (args: any) => string) => {
    server.tool(name, schema, async (args: any) => {
      try {
        // TODO (per-agent keys): permissions must come from the server, not from the tool name.
        const agent = { agentId: "mcp-agent", permissions: [name], tainted: false, sessionId } as any;
        const evalRes = await evaluateAction(agent, { toolName: name, parameters: args }, clientId);

        if (evalRes.decision === "BLOCK") return reply(`🛡️ WALL-A BLOCKED: ${evalRes.reason}`, true);
        if (evalRes.decision === "REQUIRE_APPROVAL") {
          return reply(`⚠️ WALL-A REQUIRE_APPROVAL: Action pending review. ID: ${evalRes.actionId}`, true);
        }
        // Fail closed: anything that is not an explicit ALLOW does not run.
        if (evalRes.decision !== "ALLOW") return reply("🛡️ WALL-A: unexpected decision, action not run.", true);

        await executeAction(agent.agentId, evalRes.actionId, { clientId });
        return reply(handler(args));
      } catch (e: any) {
        const status = e?.statusCode ?? 500;
        return reply(status === 500 ? "Internal error" : e.message, true);
      }
    });
  };

  registerTool("send_email", { to: z.string(), subject: z.string(), body: z.string() }, (a) => `✅ Email sent to ${a.to}`);
  registerTool("db_query", { query: z.string() }, () => `✅ Query executed.`);
  registerTool("fetch_url", { url: z.string() }, (a) => `🌐 Fetched ${a.url}. WARNING: Context is now TAINTED.`);
  registerTool("read_file", { path: z.string() }, (a) => `📄 File read: ${a.path}`);
  registerTool("write_file", { path: z.string(), content: z.string() }, (a) => `✍️ File written to ${a.path}`);
  registerTool("delete_resource", { resource: z.string() }, (a) => `🗑️ Resource deleted: ${a.resource}`);

  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP Error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
}
