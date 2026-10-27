# WALL-A: current state

Stack: Next.js 16 + TypeScript (apps/web), @wall-a/core, Supabase, Vercel. Built on mobile (Termux).
Termux can't paste secrets: tokens live in ~/.walla-admin and ~/.walla-ws.

## Done
- Per-workspace tenancy (client_id), RLS on, one audit chain per workspace
- Per-agent keys (agent_keys): evaluate, execute and MCP take identity from the key
- /connect: self-service keys, revoke, last used, human-clearable taint, pause switch
- Secret scanning with redaction before storage; Ed25519-signed audit entries
- Terminal theme (burnt orange) on dashboard, /connect, /demo

## Next
- Cleanup job for old workspaces
- Real fetch_url (needs a DNS check), list-files tool, owner-only send_email

## Update
- Hardened rules live: single SELECT only, relative file paths only, untrusted email domains need approval, URL rule blocks private and internal addresses. Red-team test: 19 of 19 pass.
- Real tools: read_file, write_file and delete_resource use a private per-workspace file store (workspace_files table, 50 files, 20,000 chars each). Isolation and reset tested. send_email, fetch_url and db_query are still simulated.
- Visitor keys stay read-only for files, and the public demo stays simulated.
- Known limits: DNS tricks on fetch_url, base64 or split secrets, fetched page content not scanned. An agent can bypass the firewall with any other tool that does the same job.
