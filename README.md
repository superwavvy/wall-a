# WALL-A: The AI Agent Firewall

WALL-A is a runtime security gateway that sits between autonomous AI agents and the tools they can access.

As AI agents (via MCP, LangChain, AutoGPT) gain the ability to read files, query databases, and send emails, they become prime targets for prompt injection and data exfiltration. If an agent reads a malicious webpage, it can be tricked into leaking sensitive data.

WALL-A intercepts every tool call, scores the risk, enforces deterministic policies, and requires human approval for dangerous actions. The AI never authorizes anything.

## Core Architecture

1. The Agent sends an action (e.g., `send_email`) to the WALL-A Gateway.
2. The Gateway canonicalizes the payload and generates a SHA-256 hash to prevent parameter tampering.
3. The Policy Engine evaluates hard rules (e.g., blocks destructive SQL or path traversal).
4. The Risk Engine calculates a 0-100 score based on session taint, destination domain, and payload size.
5. A decision is made: `ALLOW`, `REQUIRE_APPROVAL`, or `BLOCK`.
6. If allowed or approved, WALL-A executes the tool via its credential broker and logs the result.

## Key Features

### Model Context Protocol (MCP) Proxy

Agents connect to WALL-A as a standard MCP server. WALL-A holds the actual tool credentials; the agent only receives a WALL-A API key. This ensures the agent can never bypass the firewall.

### Deterministic Policy Engine

Explicit deny rules and default-deny logic. The LLM or agent cannot override a block. If an action is forbidden, it is stopped immediately.

### TOCTOU Protection (Hash Binding)

If an agent gets approval to send an email, and then attempts to swap the parameters before execution, WALL-A catches the SHA-256 hash mismatch and blocks the execution.

### Taint Tracking

When an agent fetches an untrusted URL, WALL-A marks the session as `TAINTED`. Subsequent high-impact actions (like sending emails or querying databases) are automatically escalated to human review or blocked.

### Human-in-the-Loop

Suspicious actions are paused as `PENDING`. A human must approve or reject them via the dashboard. Approvals expire after five minutes and are single-use.

### Tamper-Evident Audit Log

Every action, decision, and execution is logged in a cryptographic hash chain. If an attacker deletes a log entry, the chain breaks and the dashboard immediately flags the system as tampered.

## Interactive Attack Simulation

The repository includes a built-in, six-scenario attack simulation at `/demo`. It tests prompt injection, destructive SQL, path traversal, parameter swapping, approval replay, and a gray-area manual review. The dashboard provides a side-by-side scoreboard of leaked actions versus blocked actions, showing the firewall's effectiveness in real time.

## Tech Stack

- **Frontend and API:** Next.js 16 (App Router, Webpack mode for ARM64 compatibility)
- **Core Engine:** Node.js + TypeScript (framework-independent package)
- **Protocol:** Model Context Protocol (MCP) SDK
- **Validation:** Zod
- **Styling:** Tailwind CSS

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
# If on Termux or ARM64, use: npm run dev -- --webpack
```

Open `http://localhost:3000` to view the dashboard, or `http://localhost:3000/demo` to run the Attack Simulation.

### 4. Test the MCP Proxy

In a separate terminal, run the test script to simulate an AI agent connecting to the gateway:

```bash
cd apps/web
npx tsx test-mcp.js
```

This script attempts safe actions, malicious SQL, and prompt injections to verify the firewall's responses.

## Demo Credentials

The approval endpoint is protected by a mock admin token. If you call the API directly to approve an action, pass this header:

```text
Authorization: Bearer ADMIN_SECRET_TOKEN
```

This token is for local demos only. Replace it with real authentication before any deployment.

## Known Limitations

### In-Memory Storage

The action store and audit log are kept in `globalThis` to survive hot reloads, but they reset if the server restarts. A production deployment requires a persistent database such as Supabase or Postgres.

### Simulated Tools

The `send_email`, `db_query`, and `fetch_url` tools are simulated for the demo. Integrating real SMTP or database connections can be done through the `ToolHandlers` registry.

MIT
