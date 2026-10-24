# WALL-A: The AI Agent Firewall

**Live demo:** https://wall-a.vercel.app (shared demo, data resets periodically)

WALL-A is a runtime security gateway that sits between autonomous AI agents and the tools they can access.

As AI agents (via MCP, LangChain, AutoGPT) gain the ability to read files, query databases, and send emails, they become prime targets for prompt injection and data exfiltration. If an agent reads a malicious webpage, it can be tricked into leaking sensitive data.

WALL-A intercepts every tool call, scores the risk, enforces deterministic policies, and requires human approval for dangerous actions. The AI never authorizes anything.

## Core Architecture

1. The agent sends an action (for example `send_email`) to the WALL-A gateway.
2. The gateway canonicalizes the payload and generates a SHA-256 hash to prevent parameter tampering.
3. The policy engine evaluates hard rules (for example, it blocks destructive SQL and path traversal).
4. The risk engine calculates a 0-100 score based on session taint and destination domain.
5. A decision is made: `ALLOW`, `REQUIRE_APPROVAL`, or `BLOCK`.
6. If allowed or approved, WALL-A executes the tool and logs the result.

## Key Features

### Model Context Protocol (MCP) Proxy

Agents connect to WALL-A as a standard MCP server, so every tool call passes through the gateway.

### Deterministic Policy Engine

Explicit deny rules and default-deny logic. The LLM or agent cannot override a block. If an action is forbidden, it is stopped immediately.

### TOCTOU Protection (Hash Binding)

Each action is bound to a SHA-256 hash of its parameters. Execution takes only an action ID and re-verifies the hash, so parameters cannot be swapped after approval.

### Taint Tracking

When an agent fetches an untrusted URL, WALL-A marks the session as `TAINTED`. Subsequent high-impact actions (like sending emails or querying databases) are escalated to human review or blocked. Taint is stored on the server and tracked per session.

### Human-in-the-Loop

Suspicious actions are paused as `PENDING`. A human must approve or reject them via the dashboard. Approvals expire after five minutes and are single-use: the status change is atomic, so two simultaneous requests cannot both succeed.

### Tamper-Evident Audit Log

Every action, decision, and execution is logged in a cryptographic hash chain. If an entry is removed or edited, the chain no longer verifies.

## Interactive Attack Simulation

The repository includes a built-in, six-scenario attack simulation at `/demo`. It covers prompt injection, destructive SQL, path traversal, parameter swapping, approval replay, and a gray-area manual review. A scoreboard compares leaked actions with blocked actions, with the firewall off and on.

## Tech Stack

- **Frontend and API:** Next.js 16 (App Router, webpack mode for ARM64 compatibility)
- **Core engine:** Node.js + TypeScript (framework-independent package)
- **Protocol:** Model Context Protocol (MCP) SDK
- **Validation:** Zod
- **Styling:** Tailwind CSS
- **Database:** Supabase (PostgreSQL)

## Quick Start

### 1. Clone the repository

```bash
git clone git@github.com:superwavvy/wall-a.git
cd wall-a
```

### 2. Install dependencies

```bash
npm install
cd apps/web && npm install
cd ../../packages/core && npm install
```

### 3. Run the development server

```bash
cd ../../apps/web
npm run dev
# On Termux or ARM64, use: npm run dev -- --webpack
```

Open `http://localhost:3000` for the dashboard, or `http://localhost:3000/demo` to run the attack simulation.

### 4. Test the MCP proxy

In a separate terminal, run the test script to simulate an AI agent connecting to the gateway:

```bash
cd apps/web
npx tsx test-mcp.js
```

## Configuration

Set these as environment variables in `.env.local`, or in your Vercel project settings:

- `ADMIN_TOKEN`: required to approve actions and clear logs from the dashboard. If it is not set, those endpoints refuse every request.
- `DEMO_AGENT_IDS` (optional): comma-separated agent IDs that the public demo may approve. Defaults to `agent-001`.
- Your Supabase credentials. Without them, WALL-A falls back to in-memory storage.

Generate a secure admin token with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

The interactive `/demo` page does not use the admin token. It approves through a restricted `/api/demo` route that only works for the demo agents.

## Known Limitations

### Serverless State

If deployed to Vercel without Supabase configured, the action store and audit log will not persist between requests, because serverless functions do not share memory. A deployment needs Supabase.

### Simulated Tools

The `send_email`, `db_query`, and `fetch_url` tools are simulated. Real SMTP or database connections can be added through the `ToolHandlers` registry.

### Agent Authentication

In this version, agents are identified by an ID and their permissions are supplied with the request. Per-agent API keys with server-side permissions are the next step before any real-world use.
