# WALL-A: The AI Agent Firewall

**Live demo:** https://wall-a.vercel.app (every visitor gets a private workspace)

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

### Private Workspaces

Each browser gets its own workspace: separate actions, a separate audit chain, and row-level security on every table.

### Per-Agent Keys

Identity and permissions come from a server-side API key, never from the request body. Keys are stored only as SHA-256 hashes, and they can be revoked at any time.

### Hardened Rules

Only a single `SELECT` runs automatically; other SQL needs approval. File paths must be relative, with no hidden or sensitive files. Email to an untrusted domain needs approval (set `WALLA_TRUSTED_DOMAINS` to trust yours). Tool parameters are scanned for secrets (AWS keys, tokens, private keys), and any secret found is blocked and redacted before it is stored.

### Pause Switch and Taint Reset

One switch on `/connect` blocks everything from your connectors at once. Only a human can clear a tainted session.

### Signed Audit Log

Entries are chained by hash and signed with Ed25519, so rewriting the database makes the dashboard show TAMPERED.

## Connect your own agent

1. Open `/connect` and tap **Create connector link**. The link is shown once and works like a password.
2. In Claude, go to Settings, Connectors, and add a custom connector with that link.
3. Ask Claude to use a tool, then open the dashboard in the same browser to see what happened.

Visitor keys allow `send_email`, `fetch_url` and `read_file` only. Riskier tools need an admin-created key.

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

### 4. Connect an agent

Open `/connect` in your browser, create a connector link, and add it to Claude as a custom connector.

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

More settings used by newer features:

- `AUDIT_PRIVATE_KEY` and `AUDIT_PUBLIC_KEY`: the Ed25519 pair that signs audit entries. Back them up. If they change, older entries stop verifying.
- `WALLA_TRUSTED_DOMAINS` (optional): comma-separated email domains that skip approval.

## Known Limitations

### Serverless State

If deployed to Vercel without Supabase configured, the action store and audit log will not persist between requests, because serverless functions do not share memory. A deployment needs Supabase.

### Simulated Tools

The `send_email`, `db_query`, and `fetch_url` tools are simulated. Real SMTP or database connections can be added through the `ToolHandlers` registry.

### Agent Authentication

Agents are identified by per-agent API keys with server-side permissions. Connector links carry the key in the URL, because Claude's connector cannot send headers, so treat a link like a password and revoke it from `/connect` if it leaks.

### Workspace IDs and Logins

There are no user accounts yet. A workspace is identified by an ID stored in the browser, so clearing browser data orphans it. Real logins are not built yet.

### Secret Scanning Limits

Secrets that are base64-encoded or split across fields are not detected, and content returned by `fetch_url` is not scanned.

[![M8ven Score](https://m8ven.ai/badge/mcp/superwavvy-wall-a-18yrsp?v=dea178b453cc5aaf3c2d8fbda1f88e54)](https://m8ven.ai/mcp/superwavvy-wall-a-18yrsp?s=readme)
