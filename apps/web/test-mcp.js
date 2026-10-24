import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  console.log("Connecting to WALL-A MCP Gateway...");
  
  // Use the Streamable HTTP transport
  const transport = new StreamableHTTPClientTransport(new URL("https://wall-a.vercel.app/api/mcp"));
  const client = new Client({ name: "test-agent", version: "1.0.0" }, { capabilities: {} });

  await client.connect(transport);
  console.log("✅ Connected to MCP Server!");

  // 1. Try a Safe Action
  console.log("\n--- Agent attempting safe email ---");
  try {
    const res = await client.callTool({
      name: "send_email",
      arguments: { to: "boss@company.com", subject: "Hi", body: "Hello" }
    });
    console.log(res.content[0].text);
  } catch (e) {
    console.error(e.message);
  }

  // 2. Try a Malicious Action
  console.log("\n--- Agent attempting destructive SQL ---");
  try {
    const res = await client.callTool({
      name: "db_query",
      arguments: { query: "DROP TABLE users;" }
    });
    console.log(res.content[0].text);
  } catch (e) {
    console.error(e.message);
  }

  process.exit(0);
}

main().catch(console.error);
